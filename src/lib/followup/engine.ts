import { createServiceClient } from "@/lib/supabase/service";
import { sendText, sendMedia } from "@/lib/whatsapp/uazapi";
import { isBusinessHours, nextBusinessMoment } from "./business-hours";
import { STAGE1_MESSAGES, STAGE2_MESSAGES, STAGE_LOOP_MESSAGES, pickMessage } from "./messages";
import { logEvent } from "@/lib/log";

const STAGE2_DELAY_MS = 6 * 60 * 60 * 1000; // +6h úteis
const LOOP_DELAY_MS = 48 * 60 * 60 * 1000; // a cada 48h, pra sempre
const BATCH_SIZE = 20;

/**
 * Roda o motor de follow-up: pega conversas com next_followup_at vencido e dispara o gatilho
 * do estágio certo. Só atua em conversas 'bot' com IA ligada — se tá em fila/aberta/fechada,
 * um humano (ou o encerramento) já assumiu o próximo passo, o cron não se mete.
 */
export async function runFollowupEngine() {
  const db = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("conversations")
    .select("id,contact_id,property_id,followup_stage,next_followup_at")
    .eq("status", "bot")
    .eq("ai_enabled", true)
    .lte("next_followup_at", nowIso)
    .limit(BATCH_SIZE);

  if (error) {
    await logEvent("error", "followup", "falha ao buscar conversas vencidas", { error: error.message });
    return { processed: 0 };
  }
  if (!due || due.length === 0) return { processed: 0 };

  let processed = 0;
  for (const conv of due) {
    try {
      await processOne(db, conv);
      processed++;
    } catch (err) {
      await logEvent("error", "followup", "falha ao processar follow-up", {
        conversationId: conv.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { processed };
}

async function processOne(
  db: ReturnType<typeof createServiceClient>,
  conv: { id: string; contact_id: string; property_id: string | null; followup_stage: number }
) {
  const now = new Date();

  // fora do horário comercial: só empurra o horário, não pula o estágio nem manda nada agora
  if (!isBusinessHours(now)) {
    const next = nextBusinessMoment(now);
    await db.from("conversations").update({ next_followup_at: next.toISOString() }).eq("id", conv.id);
    return;
  }

  const { data: contact } = await db.from("contacts").select("phone").eq("id", conv.contact_id).single();
  if (!contact) return;

  const seed = `${conv.id}:${now.getTime()}`;
  const stage = conv.followup_stage;

  if (stage <= 1) {
    await sendText(contact.phone, pickMessage(STAGE1_MESSAGES, seed));
    await db
      .from("conversations")
      .update({ followup_stage: 2, next_followup_at: new Date(Date.now() + STAGE2_DELAY_MS).toISOString() })
      .eq("id", conv.id);
  } else if (stage === 2) {
    await sendText(contact.phone, pickMessage(STAGE2_MESSAGES, seed));
    await db
      .from("conversations")
      .update({ followup_stage: 3, next_followup_at: new Date(Date.now() + LOOP_DELAY_MS).toISOString() })
      .eq("id", conv.id);
  } else {
    const audioUrl = process.env.FOLLOWUP_AUDIO_URL;
    const videoUrl = process.env.FOLLOWUP_VIDEO_URL;
    await sendText(contact.phone, pickMessage(STAGE_LOOP_MESSAGES, seed));
    if (audioUrl) await sendMedia({ number: contact.phone, type: "ptt", file: audioUrl }).catch(() => {});
    else if (videoUrl) await sendMedia({ number: contact.phone, type: "video", file: videoUrl }).catch(() => {});
    await db
      .from("conversations")
      .update({ followup_stage: stage + 1, next_followup_at: new Date(Date.now() + LOOP_DELAY_MS).toISOString() })
      .eq("id", conv.id);
  }

  await db.from("messages").insert({
    conversation_id: conv.id,
    direction: "out",
    body: `[follow-up automático — estágio ${stage}]`,
    is_internal: true,
  });
}
