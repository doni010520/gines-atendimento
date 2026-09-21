import { createServiceClient } from "@/lib/supabase/service";
import { sendMedia, sendText } from "@/lib/whatsapp/uazapi";
import { isWithinWindow, modoTesteGapMs, nextAllowedTime } from "./business-hours";
import { gerarTextoToque } from "./ai-copy";
import { isMediaTouch } from "./media";
import { logEvent } from "@/lib/log";

/**
 * Cadência de follow-up (spec do cliente, 09/26).
 *
 * O relógio começa na ÚLTIMA mensagem do robô sem resposta do lead (a "âncora"). Qualquer
 * resposta do lead para tudo; a próxima resposta do robô recomeça do toque 1, ancorada nela.
 *
 *   toque 1 = 24h   texto (retoma de onde parou) + áudio/vídeo
 *   toque 2 = 48h   texto (tentativa leve)
 *   toque 3 = 96h   texto (escassez) + áudio/vídeo
 *   toque 4 = 120h  texto (investigação)
 *   toque 5 = 168h  texto (penúltima tentativa)
 *   toque 6 = 216h  texto (ultimato) + áudio/vídeo -> tag "Perdido por Falta de Retorno" e fim
 *
 * As horas contam a partir da âncora, não do toque anterior — atraso num toque (janela de
 * horário, cron parado) não empurra os seguintes.
 *
 * followup_stage: 0 = parada; 1..6 = próximo toque a enviar; STAGE_DONE = encerrada.
 */

export const TOUCH_OFFSET_HOURS: Record<number, number> = { 1: 24, 2: 48, 3: 96, 4: 120, 5: 168, 6: 216 };
export const LAST_TOUCH = 6;
export const STAGE_DONE = 7;
export const TAG_PERDIDO = "Perdido por Falta de Retorno";

/**
 * Piso entre dois toques. Se o cron ficou parado e vários toques venceram juntos, eles
 * saem espaçados em vez de em rajada — o lead não recebe três mensagens no mesmo minuto.
 */
const MIN_GAP_BETWEEN_TOUCHES_MS = 60 * 60 * 1000;

const BATCH_SIZE = 20;

type Db = ReturnType<typeof createServiceClient>;

/**
 * Quando o toque deve sair, dada a âncora. Já aplica a janela de horário (fora dela, adia
 * pra próxima abertura) e o piso `notBefore`. No modo de teste, o toque N sai N×gap depois
 * da âncora e a janela é ignorada.
 */
export function scheduleTouch(touch: number, anchor: Date, notBefore?: Date): Date | null {
  const horas = TOUCH_OFFSET_HOURS[touch];
  if (horas === undefined) return null;

  const gapTeste = modoTesteGapMs();
  if (gapTeste !== null) {
    const at = new Date(anchor.getTime() + touch * gapTeste);
    return notBefore && at < notBefore ? notBefore : at;
  }

  let at = new Date(anchor.getTime() + horas * 60 * 60 * 1000);
  if (notBefore && at < notBefore) at = notBefore;
  return nextAllowedTime(at);
}

/**
 * Robô acabou de falar: (re)começa a cadência do toque 1 ancorada nessa mensagem.
 * Só vale pra conversa do robô, com IA ligada e sem opt-out — o mesmo filtro do cron.
 */
export async function iniciarCadencia(db: Db, conversationId: string, anchor: Date) {
  const primeiro = scheduleTouch(1, anchor);
  const { error } = await db
    .from("conversations")
    .update({
      followup_anchor_at: anchor.toISOString(),
      followup_stage: 1,
      next_followup_at: primeiro?.toISOString() ?? null,
    })
    .eq("id", conversationId)
    .eq("status", "bot")
    .eq("ai_enabled", true)
    .eq("opt_out", false);
  if (error) {
    await logEvent("error", "followup", "falha ao iniciar cadência", { conversationId, error: error.message });
  }
}

/** Lead respondeu: a cadência para até o robô falar de novo. */
export async function pararCadencia(db: Db, conversationId: string) {
  await db
    .from("conversations")
    .update({ followup_stage: 0, next_followup_at: null, followup_anchor_at: null })
    .eq("id", conversationId);
}

const DUE_COLUMNS = "id,contact_id,property_id,followup_stage,followup_anchor_at,tags,bot_lock_until";

type DueConversation = {
  id: string;
  contact_id: string;
  property_id: string | null;
  followup_stage: number;
  followup_anchor_at: string | null;
  tags: string[];
  bot_lock_until: string | null;
};

/**
 * Pega as conversas com toque vencido e dispara. Só atua em conversa 'bot' com IA ligada e
 * sem opt-out — se está em fila/aberta/fechada, um humano já assumiu e o cron não se mete.
 */
export async function runFollowupEngine() {
  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("conversations")
    .select(DUE_COLUMNS)
    .eq("status", "bot")
    .eq("ai_enabled", true)
    .eq("opt_out", false)
    .gte("followup_stage", 1)
    .lte("followup_stage", LAST_TOUCH)
    .lte("next_followup_at", nowIso)
    .limit(BATCH_SIZE);

  if (error) {
    await logEvent("error", "followup", "falha ao buscar conversas vencidas", { error: error.message });
    return { processed: 0, sent: 0 };
  }
  if (!due || due.length === 0) return { processed: 0, sent: 0 };

  const gapTeste = modoTesteGapMs();
  if (gapTeste !== null) {
    await logEvent("warn", "followup", "MODO DE TESTE ligado — janela ignorada e toques comprimidos", {
      gapMinutos: gapTeste / 60_000,
      conversas: due.length,
    });
  }

  let processed = 0;
  let sent = 0;
  for (const conv of due) {
    try {
      if (await processOne(db, conv)) sent++;
      processed++;
    } catch (err) {
      await logEvent("error", "followup", "falha ao processar follow-up", {
        conversationId: conv.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { processed, sent };
}

/** @returns true se o toque foi enviado de fato (false = só reagendou/parou). */
async function processOne(db: Db, conv: DueConversation): Promise<boolean> {
  const now = new Date();

  // agente respondendo nesse instante: deixa pra próxima rodada, ele vai reancorar a cadência
  if (conv.bot_lock_until && conv.bot_lock_until > now.toISOString()) return false;

  // fora da janela: só adia, nunca pula toque nem manda fora de hora
  // (no modo de teste a janela é ignorada de propósito — é o ponto do modo)
  if (modoTesteGapMs() === null && !isWithinWindow(now)) {
    await db
      .from("conversations")
      .update({ next_followup_at: nextAllowedTime(now).toISOString() })
      .eq("id", conv.id);
    return false;
  }

  const resultado = await enviarToque(db, conv, now);
  return resultado.enviado;
}

export type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
  toque?: number;
  mensagem?: string;
  origemTexto?: "ia" | "fallback";
  midia?: { tipo: string; url: string } | null;
  proximo?: string | null;
  encerrada?: boolean;
};

/**
 * Gera o texto do toque atual, envia (texto + mídia do slot, se houver) e avança o estado.
 * Único ponto que manda follow-up — o cron e o disparo manual de teste passam os dois por
 * aqui, senão o teste validaria um caminho que a produção não usa.
 */
async function enviarToque(db: Db, conv: DueConversation, now: Date): Promise<ResultadoEnvio> {
  const touch = conv.followup_stage;
  if (TOUCH_OFFSET_HOURS[touch] === undefined) return { enviado: false, motivo: "estágio fora da cadência" };

  // defesa: se a última mensagem visível é do lead, a cadência não devia estar rodando
  const { data: ultima } = await db
    .from("messages")
    .select("direction")
    .eq("conversation_id", conv.id)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima || ultima.direction === "in" || !conv.followup_anchor_at) {
    await pararCadencia(db, conv.id);
    return { enviado: false, motivo: "lead respondeu depois da última mensagem do robô — cadência parada" };
  }

  const { data: contact } = await db.from("contacts").select("phone,name").eq("id", conv.contact_id).single();
  if (!contact) return { enviado: false, motivo: "contato não encontrado" };

  const { texto, origem } = await gerarTextoToque({
    db,
    conversationId: conv.id,
    touch,
    nome: contact.name,
    propertyId: conv.property_id,
    now,
  });

  await sendText(contact.phone, texto);
  // entra no histórico como mensagem real: o Gines vê no painel e a IA não repete o assunto
  await db.from("messages").insert({ conversation_id: conv.id, direction: "out", body: texto, is_internal: false });

  let midia: ResultadoEnvio["midia"] = null;
  if (isMediaTouch(touch)) {
    const { data: slot } = await db.from("followup_media").select("media_type,url").eq("touch", touch).maybeSingle();
    if (slot) {
      try {
        // áudio vai como "ptt" pra chegar como mensagem de voz, não como arquivo
        await sendMedia({ number: contact.phone, type: slot.media_type === "video" ? "video" : "ptt", file: slot.url });
        await db.from("messages").insert({
          conversation_id: conv.id,
          direction: "out",
          body: slot.media_type === "video" ? "[vídeo da cadência enviado]" : "[áudio da cadência enviado]",
          media_url: slot.url,
          media_type: slot.media_type,
          is_internal: false,
        });
        midia = { tipo: slot.media_type, url: slot.url };
      } catch (err) {
        // o texto já foi — falha na mídia não trava a cadência
        await logEvent("error", "followup", "falha ao enviar mídia do toque", {
          conversationId: conv.id,
          touch,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const encerrada = touch >= LAST_TOUCH;
  const piso = new Date(now.getTime() + Math.min(MIN_GAP_BETWEEN_TOUCHES_MS, modoTesteGapMs() ?? Infinity));
  const proximo = encerrada ? null : scheduleTouch(touch + 1, new Date(conv.followup_anchor_at), piso);

  await db
    .from("conversations")
    .update({
      followup_stage: encerrada || !proximo ? STAGE_DONE : touch + 1,
      next_followup_at: proximo?.toISOString() ?? null,
      last_message_at: now.toISOString(),
      ...(encerrada ? { tags: Array.from(new Set([...(conv.tags ?? []), TAG_PERDIDO])) } : {}),
    })
    .eq("id", conv.id);

  if (encerrada) {
    await logEvent("info", "followup", "cadência encerrada sem retorno — conversa marcada como perdida", {
      conversationId: conv.id,
    });
  }

  return {
    enviado: true,
    toque: touch,
    mensagem: texto,
    origemTexto: origem,
    midia,
    proximo: proximo?.toISOString() ?? null,
    encerrada,
  };
}

/**
 * Dispara o toque atual AGORA, ignorando a janela de horário — só pra teste.
 * Manda WhatsApp de verdade e avança o estado igual ao cron, por isso vive atrás do
 * /api/debug (DEBUG=true + token + confirmação explícita).
 */
export async function dispararToqueAgora(db: Db, conversationId: string): Promise<ResultadoEnvio> {
  const { data: conv } = await db
    .from("conversations")
    .select(`${DUE_COLUMNS},opt_out,status,ai_enabled`)
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return { enviado: false, motivo: "conversa não encontrada" };
  if (conv.opt_out) return { enviado: false, motivo: "conversa com opt-out — a cadência está travada de propósito" };
  // mesma condição do cron: humano assumiu, o robô não fala mais. Sem isso, um teste
  // mandaria follow-up pra cliente real que já está sendo atendido por gente.
  if (conv.status !== "bot" || !conv.ai_enabled) {
    return {
      enviado: false,
      motivo: `conversa está em "${conv.status}" com IA ${conv.ai_enabled ? "ligada" : "desligada"} — o cron também não tocaria nela. Devolva pro robô no painel se quiser testar aqui.`,
    };
  }
  if (conv.followup_stage < 1 || conv.followup_stage > LAST_TOUCH) {
    return {
      enviado: false,
      motivo:
        conv.followup_stage >= STAGE_DONE
          ? "cadência já encerrada (o toque 6 foi o último)"
          : "cadência parada — o robô precisa ter falado por último (sem resposta do lead)",
    };
  }

  return enviarToque(db, conv, new Date());
}
