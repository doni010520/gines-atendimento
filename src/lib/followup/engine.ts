import { createServiceClient } from "@/lib/supabase/service";
import { sendText } from "@/lib/whatsapp/uazapi";
import {
  greetingFor,
  nextShiftSlot,
  parseShift,
  resolveShift,
  shouldSendNow,
  type Shift,
} from "./business-hours";
import { copyDia1, copyDia3, copyDia7, type CopyVars } from "./messages";
import { getHighlights, pareceReformado, type PropertyForHighlights } from "./highlights";
import { logEvent } from "@/lib/log";

/**
 * Régua de conversão do Gines (26/08/26):
 *   estágio 1 = Dia 1, fim de tarde      — recepção do material + facilidade de visitação
 *   estágio 2 = Dia 3, manhã             — pronto para morar + diferencial técnico
 *   estágio 3 = Dia 7, início da tarde   — escassez sutil + último contato ativo
 *   estágio 4 = encerrada, não manda mais nada (é o que a copy do D7 promete ao cliente)
 *
 * Os dias contam a partir do envio do material, não do disparo anterior — atraso num
 * estágio não empurra os seguintes.
 */

const STAGE_SHIFT: Record<number, Shift> = { 1: "fim_tarde", 2: "manha", 3: "tarde" };
const STAGE_DAY_OFFSET: Record<number, number> = { 1: 0, 2: 2, 3: 6 };
export const STAGE_DONE = 4;

/** O D1 nunca cola no envio do material, mesmo que o material tenha ido no fim da tarde. */
const MIN_GAP_AFTER_MATERIAL_MS = 2 * 60 * 60 * 1000;

const BATCH_SIZE = 20;

/** Quando e em que turno o estágio deve sair. */
export function scheduleStage(
  stage: number,
  materialSentAt: Date,
  lastShift: Shift | null,
  now: Date = new Date()
): { at: Date; shift: Shift } | null {
  if (!STAGE_SHIFT[stage]) return null;

  const shift = resolveShift(STAGE_SHIFT[stage], lastShift);
  let at = nextShiftSlot(materialSentAt, shift, STAGE_DAY_OFFSET[stage]);

  const floor = new Date(now.getTime() + (stage === 1 ? MIN_GAP_AFTER_MATERIAL_MS : 0));
  if (at.getTime() < floor.getTime()) at = nextShiftSlot(floor, shift, 0);

  return { at, shift };
}

/**
 * Pega as conversas com follow-up vencido e dispara o estágio certo. Só atua em conversa
 * 'bot' com IA ligada e sem opt-out — se está em fila/aberta/fechada, um humano já assumiu
 * o próximo passo e o cron não se mete.
 */
export async function runFollowupEngine() {
  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("conversations")
    .select("id,contact_id,property_id,followup_stage,last_followup_shift,material_sent_at")
    .eq("status", "bot")
    .eq("ai_enabled", true)
    .eq("opt_out", false)
    .gte("followup_stage", 1)
    .lt("followup_stage", STAGE_DONE)
    .lte("next_followup_at", nowIso)
    .limit(BATCH_SIZE);

  if (error) {
    await logEvent("error", "followup", "falha ao buscar conversas vencidas", { error: error.message });
    return { processed: 0, sent: 0 };
  }
  if (!due || due.length === 0) return { processed: 0, sent: 0 };

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

/** Campos do imóvel que as copies da régua consomem. */
export type PropertyForCopy = PropertyForHighlights & {
  neighborhood: string | null;
  city: string | null;
  video_url: string | null;
  pdf_url: string | null;
};

/** Colunas que precisam vir do banco pra montar qualquer copy da régua. */
export const PROPERTY_COPY_COLUMNS =
  "id,title,kind,copy,features,area_built,suites,parking_spots,neighborhood,city,video_url,pdf_url,highlight_visual,highlight_tecnico";

export async function buildCopyVars(
  db: ReturnType<typeof createServiceClient>,
  property: PropertyForCopy,
  nome: string | null,
  now: Date
): Promise<CopyVars> {
  const highlights = await getHighlights(db, property);
  return {
    nome,
    local: property.neighborhood?.trim() || property.city?.trim() || "",
    tipo: property.kind?.trim() || "imóvel",
    destaqueVisual: highlights.visual,
    destaqueTecnico: highlights.tecnico,
    reformado: pareceReformado(property),
    temPdf: Boolean(property.pdf_url),
    temVideo: Boolean(property.video_url),
    saudacao: greetingFor(now),
  };
}

export function renderStage(stage: number, vars: CopyVars): string {
  if (stage === 1) return copyDia1(vars);
  if (stage === 2) return copyDia3(vars);
  return copyDia7(vars);
}

type DueConversation = {
  id: string;
  contact_id: string;
  property_id: string | null;
  followup_stage: number;
  last_followup_shift: string | null;
  material_sent_at: string | null;
};

/** @returns true se a mensagem foi enviada de fato (false = só reagendou). */
async function processOne(db: ReturnType<typeof createServiceClient>, conv: DueConversation): Promise<boolean> {
  const now = new Date();
  const stage = conv.followup_stage;
  const preferido = STAGE_SHIFT[stage];

  // estágio fora da régua (dado antigo, migração): encerra em vez de tentar adivinhar turno
  if (!preferido) {
    await db
      .from("conversations")
      .update({ followup_stage: STAGE_DONE, next_followup_at: null })
      .eq("id", conv.id);
    return false;
  }

  const lastShift = parseShift(conv.last_followup_shift);
  const shift = resolveShift(preferido, lastShift);

  // fora do turno certo: só reagenda, nunca pula estágio nem manda fora de hora
  if (!shouldSendNow(now, shift, lastShift)) {
    await db
      .from("conversations")
      .update({ next_followup_at: nextShiftSlot(now, shift, 0).toISOString() })
      .eq("id", conv.id);
    return false;
  }

  const { data: contact } = await db.from("contacts").select("phone,name").eq("id", conv.contact_id).single();
  if (!contact) return false;

  const { data: property } = conv.property_id
    ? await db.from("properties").select(PROPERTY_COPY_COLUMNS).eq("id", conv.property_id).maybeSingle()
    : { data: null };

  // sem imóvel em foco não existe copy honesta pra mandar — encerra a régua e deixa pro humano
  if (!property) {
    await db
      .from("conversations")
      .update({ followup_stage: STAGE_DONE, next_followup_at: null })
      .eq("id", conv.id);
    await logEvent("warn", "followup", "conversa sem imóvel em foco — régua encerrada", { conversationId: conv.id });
    return false;
  }

  const vars = await buildCopyVars(db, property, contact.name, now);
  const body = renderStage(stage, vars);

  await sendText(contact.phone, body);

  const proximo = scheduleStage(stage + 1, new Date(conv.material_sent_at ?? now.toISOString()), shift, now);

  await db
    .from("conversations")
    .update({
      followup_stage: proximo ? stage + 1 : STAGE_DONE,
      next_followup_at: proximo ? proximo.at.toISOString() : null,
      last_followup_shift: shift,
      last_message_at: now.toISOString(),
    })
    .eq("id", conv.id);

  // entra no histórico como mensagem real: o Gines vê no painel e a IA não repete o assunto
  await db.from("messages").insert({
    conversation_id: conv.id,
    direction: "out",
    body,
    is_internal: false,
  });

  return true;
}
