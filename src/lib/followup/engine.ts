import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMedia, sendText } from "@/lib/whatsapp/uazapi";
import { isWithinWindow, modoTesteGapMs, nextAllowedTime } from "./business-hours";
import { gerarTextoToque } from "./ai-copy";
import {
  carregarConfig,
  carregarToquesAtivos,
  indiceDoToque,
  proximoToque,
  type ConfigCadencia,
  type Toque,
} from "./touches";
import { logEvent } from "@/lib/log";

/**
 * Cadência de follow-up — toques configurados no painel (/cadencia, tabela followup_touches).
 *
 * O relógio começa na ÚLTIMA mensagem do robô sem resposta do lead (a "âncora"). Qualquer
 * resposta do lead para tudo; a próxima resposta do robô recomeça do primeiro toque.
 *
 * Cada toque sai `delay_hours` depois da âncora — atraso num toque (janela de horário, cron
 * parado) não empurra os seguintes. A ordem é o delay. Depois do último toque ativo a
 * conversa recebe a etiqueta final (se ligada no painel) e a cadência encerra.
 *
 * Estado na conversa:
 *   followup_stage             0 = parada; 1 = rodando; STAGE_DONE = encerrada
 *   followup_last_touch_hours  horas do último toque enviado (0 = nenhum)
 *   followup_last_touch_at     quando ele saiu (piso de 1h pro próximo)
 *   followup_next_touch_id     toque agendado (informativo — recalculado ao enviar)
 *
 * O próximo toque é sempre recalculado da lista ATUAL ("primeiro ativo com delay maior que o
 * último enviado"), então editar a cadência no meio não reenvia nada nem volta atrás.
 */

export const STAGE_STOPPED = 0;
export const STAGE_RUNNING = 1;
export const STAGE_DONE = 7;

/**
 * Piso entre dois toques. Se o cron ficou parado, ou o painel encurtou as horas, e vários
 * toques venceram juntos, eles saem espaçados em vez de em rajada.
 */
const MIN_GAP_BETWEEN_TOUCHES_MS = 60 * 60 * 1000;

/** Tolerância do "já venceu?" — evita reagendar por diferença de segundos. */
const FOLGA_MS = 60 * 1000;

const BATCH_SIZE = 20;

type Db = SupabaseClient<Database>;

function gapMinimoMs() {
  return Math.min(MIN_GAP_BETWEEN_TOUCHES_MS, modoTesteGapMs() ?? Infinity);
}

/**
 * Quando o toque deve sair, dada a âncora. Já aplica a janela de horário (fora dela, adia
 * pra próxima abertura) e o piso `notBefore`. No modo de teste, o toque de posição k sai
 * k×gap depois da âncora e a janela é ignorada.
 */
export function scheduleTouch(toque: Pick<Toque, "delay_hours">, indice: number, anchor: Date, notBefore?: Date | null): Date {
  const gapTeste = modoTesteGapMs();
  if (gapTeste !== null) {
    const at = new Date(anchor.getTime() + Math.max(1, indice) * gapTeste);
    return notBefore && at < notBefore ? notBefore : at;
  }

  let at = new Date(anchor.getTime() + Number(toque.delay_hours) * 60 * 60 * 1000);
  if (notBefore && at < notBefore) at = notBefore;
  return nextAllowedTime(at);
}

/** Piso do próximo toque: 1h (ou o gap do modo teste) depois do último enviado. */
function pisoDepoisDe(ultimoEnvio: string | null): Date | null {
  return ultimoEnvio ? new Date(new Date(ultimoEnvio).getTime() + gapMinimoMs()) : null;
}

/**
 * Robô acabou de falar: (re)começa a cadência do primeiro toque ancorada nessa mensagem.
 * Só vale pra conversa do robô, com IA ligada e sem opt-out — o mesmo filtro do cron.
 */
export async function iniciarCadencia(db: Db, conversationId: string, anchor: Date) {
  let primeiro: Toque | null = null;
  try {
    primeiro = (await carregarToquesAtivos(db))[0] ?? null;
  } catch (err) {
    await logEvent("error", "followup", "falha ao iniciar cadência", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const { error } = await db
    .from("conversations")
    .update({
      followup_anchor_at: anchor.toISOString(),
      // sem nenhum toque ativo no painel, não há cadência pra rodar
      followup_stage: primeiro ? STAGE_RUNNING : STAGE_STOPPED,
      followup_last_touch_hours: 0,
      followup_last_touch_at: null,
      followup_next_touch_id: primeiro?.id ?? null,
      next_followup_at: primeiro ? scheduleTouch(primeiro, 1, anchor).toISOString() : null,
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
    .update({
      followup_stage: STAGE_STOPPED,
      next_followup_at: null,
      followup_anchor_at: null,
      followup_last_touch_hours: 0,
      followup_last_touch_at: null,
      followup_next_touch_id: null,
    })
    .eq("id", conversationId);
}

const DUE_COLUMNS =
  "id,contact_id,property_id,followup_stage,followup_anchor_at,followup_last_touch_hours,followup_last_touch_at,tags,bot_lock_until";

type DueConversation = {
  id: string;
  contact_id: string;
  property_id: string | null;
  followup_stage: number;
  followup_anchor_at: string | null;
  followup_last_touch_hours: number;
  followup_last_touch_at: string | null;
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
    .eq("followup_stage", STAGE_RUNNING)
    .lte("next_followup_at", nowIso)
    .limit(BATCH_SIZE);

  if (error) {
    await logEvent("error", "followup", "falha ao buscar conversas vencidas", { error: error.message });
    return { processed: 0, sent: 0 };
  }
  if (!due || due.length === 0) return { processed: 0, sent: 0 };

  let toques: Toque[];
  let config: ConfigCadencia;
  try {
    [toques, config] = await Promise.all([carregarToquesAtivos(db), carregarConfig(db)]);
  } catch (err) {
    await logEvent("error", "followup", "falha ao carregar a configuração da cadência", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { processed: 0, sent: 0 };
  }

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
      if (await processOne(db, conv, toques, config)) sent++;
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
async function processOne(db: Db, conv: DueConversation, toques: Toque[], config: ConfigCadencia): Promise<boolean> {
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

  const resultado = await enviarToque(db, conv, now, toques, config, { forcar: false });
  return resultado.enviado;
}

export type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
  toque?: number;
  total?: number;
  horas?: number;
  mensagem?: string;
  origemTexto?: "ia" | "fallback";
  midia?: { tipo: string; url: string } | null;
  proximo?: string | null;
  encerrada?: boolean;
};

/** Encerra a cadência: marca como encerrada e põe a etiqueta final, se ligada no painel. */
async function encerrar(db: Db, conv: DueConversation, config: ConfigCadencia, extra: Record<string, unknown> = {}) {
  const tags = config.applyFinalTag ? Array.from(new Set([...(conv.tags ?? []), config.finalTag])) : conv.tags;
  await db
    .from("conversations")
    .update({ followup_stage: STAGE_DONE, next_followup_at: null, followup_next_touch_id: null, tags, ...extra })
    .eq("id", conv.id);
  await logEvent("info", "followup", "cadência encerrada sem retorno", {
    conversationId: conv.id,
    etiqueta: config.applyFinalTag ? config.finalTag : null,
  });
}

/**
 * Gera o texto do próximo toque, envia (texto + mídia do toque, se houver) e avança o estado.
 * Único ponto que manda follow-up — o cron e o disparo manual de teste passam os dois por
 * aqui, senão o teste validaria um caminho que a produção não usa.
 *
 * `forcar` (só o disparo de teste) manda mesmo que a lista tenha sido editada e o toque
 * ainda não tenha vencido.
 */
async function enviarToque(
  db: Db,
  conv: DueConversation,
  now: Date,
  toques: Toque[],
  config: ConfigCadencia,
  { forcar }: { forcar: boolean }
): Promise<ResultadoEnvio> {
  if (!conv.followup_anchor_at) {
    await pararCadencia(db, conv.id);
    return { enviado: false, motivo: "conversa sem âncora — cadência parada" };
  }
  const anchor = new Date(conv.followup_anchor_at);

  const toque = proximoToque(toques, conv.followup_last_touch_hours);
  if (!toque) {
    // o painel removeu/desativou os toques que faltavam: acabou a cadência
    await encerrar(db, conv, config);
    return { enviado: false, motivo: "não há mais toques ativos depois do último enviado — cadência encerrada", encerrada: true };
  }
  const indice = indiceDoToque(toques, toque.id);

  // a lista pode ter mudado desde o agendamento (horas aumentadas, toque trocado): recalcula
  // a partir da âncora e, se ainda não venceu, só reagenda
  const devido = scheduleTouch(toque, indice, anchor, pisoDepoisDe(conv.followup_last_touch_at));
  if (!forcar && devido.getTime() > now.getTime() + FOLGA_MS) {
    await db
      .from("conversations")
      .update({ next_followup_at: devido.toISOString(), followup_next_touch_id: toque.id })
      .eq("id", conv.id);
    return { enviado: false, motivo: "cadência editada — toque reagendado", proximo: devido.toISOString() };
  }

  // defesa: se a última mensagem visível é do lead, a cadência não devia estar rodando
  const { data: ultima } = await db
    .from("messages")
    .select("direction")
    .eq("conversation_id", conv.id)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultima || ultima.direction === "in") {
    await pararCadencia(db, conv.id);
    return { enviado: false, motivo: "lead respondeu depois da última mensagem do robô — cadência parada" };
  }

  const { data: contact } = await db.from("contacts").select("phone,name").eq("id", conv.contact_id).single();
  if (!contact) return { enviado: false, motivo: "contato não encontrado" };

  const { texto, origem } = await gerarTextoToque({
    db,
    conversationId: conv.id,
    toque,
    indice,
    total: toques.length,
    nome: contact.name,
    propertyId: conv.property_id,
    now,
  });

  await sendText(contact.phone, texto);
  // entra no histórico como mensagem real: o Gines vê no painel e a IA não repete o assunto
  await db.from("messages").insert({ conversation_id: conv.id, direction: "out", body: texto, is_internal: false });

  let midia: ResultadoEnvio["midia"] = null;
  if (toque.media_url && toque.media_kind) {
    try {
      // áudio vai como "ptt" pra chegar como mensagem de voz, não como arquivo
      await sendMedia({ number: contact.phone, type: toque.media_kind === "video" ? "video" : "ptt", file: toque.media_url });
      await db.from("messages").insert({
        conversation_id: conv.id,
        direction: "out",
        body: toque.media_kind === "video" ? "[vídeo da cadência enviado]" : "[áudio da cadência enviado]",
        media_url: toque.media_url,
        media_type: toque.media_kind,
        is_internal: false,
      });
      midia = { tipo: toque.media_kind, url: toque.media_url };
    } catch (err) {
      // o texto já foi — falha na mídia não trava a cadência
      await logEvent("error", "followup", "falha ao enviar mídia do toque", {
        conversationId: conv.id,
        toque: indice,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const seguinte = proximoToque(toques, toque.delay_hours);
  const estadoEnviado = {
    followup_last_touch_hours: Number(toque.delay_hours),
    followup_last_touch_at: now.toISOString(),
    last_message_at: now.toISOString(),
  };

  let proximo: Date | null = null;
  if (seguinte) {
    proximo = scheduleTouch(seguinte, indice + 1, anchor, new Date(now.getTime() + gapMinimoMs()));
    await db
      .from("conversations")
      .update({ ...estadoEnviado, followup_next_touch_id: seguinte.id, next_followup_at: proximo.toISOString() })
      .eq("id", conv.id);
  } else {
    await encerrar(db, conv, config, estadoEnviado);
  }

  return {
    enviado: true,
    toque: indice,
    total: toques.length,
    horas: Number(toque.delay_hours),
    mensagem: texto,
    origemTexto: origem,
    midia,
    proximo: proximo?.toISOString() ?? null,
    encerrada: !seguinte,
  };
}

/**
 * Painel mudou a lista de toques: recalcula o próximo toque e o horário de toda conversa com
 * cadência rodando, a partir da âncora. Não envia nada — toque que ficou "vencido" sai na
 * próxima rodada do cron, respeitando o piso de 1h desde o último envio (sem rajada).
 */
export async function reagendarCadencias(db: Db) {
  const toques = await carregarToquesAtivos(db);
  const { data: rodando, error } = await db
    .from("conversations")
    .select("id,followup_anchor_at,followup_last_touch_hours,followup_last_touch_at")
    .eq("followup_stage", STAGE_RUNNING);
  if (error) throw new Error(error.message);

  for (const conv of rodando ?? []) {
    if (!conv.followup_anchor_at) continue;
    const toque = proximoToque(toques, conv.followup_last_touch_hours);
    // sem próximo: deixa vencer agora, o cron encerra e põe a etiqueta pelo caminho normal
    const quando = toque
      ? scheduleTouch(toque, indiceDoToque(toques, toque.id), new Date(conv.followup_anchor_at), pisoDepoisDe(conv.followup_last_touch_at))
      : new Date();
    await db
      .from("conversations")
      .update({ followup_next_touch_id: toque?.id ?? null, next_followup_at: quando.toISOString() })
      .eq("id", conv.id);
  }
  return (rodando ?? []).length;
}

/**
 * Dispara o próximo toque AGORA, ignorando a janela de horário — só pra teste.
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
  if (conv.followup_stage !== STAGE_RUNNING) {
    return {
      enviado: false,
      motivo:
        conv.followup_stage >= STAGE_DONE
          ? "cadência já encerrada (o último toque já saiu)"
          : "cadência parada — o robô precisa ter falado por último (sem resposta do lead)",
    };
  }

  const [toques, config] = await Promise.all([carregarToquesAtivos(db), carregarConfig(db)]);
  return enviarToque(db, conv, new Date(), toques, config, { forcar: true });
}
