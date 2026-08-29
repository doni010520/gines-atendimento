import { createServiceClient } from "@/lib/supabase/service";
import { parseUazapiMessage, type ParsedInboundMessage } from "./parse-webhook";
import { scheduleDebounced } from "./debounce";
import { runAgentTurn } from "@/lib/ai/agent";
import { casarImovelPorAnuncio } from "./match-property";
import { logEvent } from "@/lib/log";
import { sendText, downloadAndTranscribeAudio } from "./uazapi";

const STALE_MS = Number(process.env.BOT_STALE_MS ?? 5 * 60 * 1000);

const AUDIO_MESSAGE_TYPES = new Set(["audiomessage", "ptt", "audio"]);

function isAudioMessage(parsed: ParsedInboundMessage): boolean {
  if (AUDIO_MESSAGE_TYPES.has(parsed.messageType.toLowerCase())) return true;
  const raw = parsed.raw as Record<string, unknown> | undefined;
  const content = raw?.content;
  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    if (c.PTT === true) return true;
    if (typeof c.mimetype === "string" && c.mimetype.startsWith("audio/")) return true;
  }
  return false;
}

// comando de teste: a própria pessoa manda "/reset" no WhatsApp e a conversa some,
// sem precisar entrar no painel. Barra no início pra não confundir com texto normal
// de um cliente de verdade.
const RESET_COMMAND_RE = /^\/reset$/i;

/** Apaga contato + conversa + mensagens de um telefone — usado pelo comando /reset. */
async function resetConversationByPhone(db: ReturnType<typeof createServiceClient>, phone: string) {
  const { data: contact } = await db.from("contacts").select("id").eq("phone", phone).maybeSingle();
  if (contact) {
    const { data: conversation } = await db
      .from("conversations")
      .select("id")
      .eq("contact_id", contact.id)
      .maybeSingle();
    if (conversation) {
      await db.from("messages").delete().eq("conversation_id", conversation.id);
      await db.from("ad_referrals").delete().eq("conversation_id", conversation.id);
      await db.from("conversations").delete().eq("id", conversation.id);
    }
    await db.from("contacts").delete().eq("id", contact.id);
  }
  await sendText(phone, "🔄 Conversa zerada! Pode mandar uma mensagem pra começar do zero.").catch((err) =>
    logEvent("error", "reset-command", "falha ao confirmar reset", {
      error: err instanceof Error ? err.message : String(err),
    })
  );
}

async function getOrCreateContact(db: ReturnType<typeof createServiceClient>, phone: string, name?: string) {
  const { data: existing } = await db.from("contacts").select("*").eq("phone", phone).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await db
    .from("contacts")
    .insert({ phone, name: name ?? null })
    .select()
    .single();
  if (error) {
    // corrida: outro processo criou primeiro — relê
    const { data: retry } = await db.from("contacts").select("*").eq("phone", phone).single();
    if (retry) return retry;
    throw error;
  }
  return created;
}

async function getOrCreateConversation(db: ReturnType<typeof createServiceClient>, contactId: string) {
  const { data: existing } = await db
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await db
    .from("conversations")
    .insert({ contact_id: contactId })
    .select()
    .single();
  if (error) {
    const { data: retry } = await db.from("conversations").select("*").eq("contact_id", contactId).single();
    if (retry) return retry;
    throw error;
  }
  return created;
}

export async function handleInboundMessage(rawMessage: Record<string, unknown>) {
  const db = createServiceClient();
  const parsed = parseUazapiMessage(rawMessage);

  if (parsed.isGroup) return; // grupos não entram no atendimento
  if (!parsed.phone) return;

  if (!parsed.fromMe && RESET_COMMAND_RE.test(parsed.text.trim())) {
    await resetConversationByPhone(db, parsed.phone);
    return;
  }

  // mensagem velha reentregue pelo provedor — persiste pra histórico, mas não dispara o bot
  const rawTs = rawMessage.messageTimestamp;
  const messageTimestamp = typeof rawTs === "number" ? rawTs : Number(rawTs ?? 0);
  const isStale = messageTimestamp > 0 && Date.now() - messageTimestamp > STALE_MS;

  const contact = await getOrCreateContact(db, parsed.phone, parsed.senderName);
  const conversation = await getOrCreateConversation(db, contact.id);

  if (parsed.fromMe) {
    await handleFromMe(db, conversation.id, parsed, rawMessage);
    return;
  }

  let body = parsed.text || null;
  let mediaUrl = parsed.fileUrl ?? null;

  if (!body && parsed.messageId && isAudioMessage(parsed)) {
    const transcribed = await downloadAndTranscribeAudio(parsed.messageId).catch((err) => {
      logEvent("error", "inbound", "falha ao transcrever áudio", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { text: null, fileUrl: null };
    });
    body = transcribed.text ?? "(áudio recebido, mas não consegui transcrever — peça pra pessoa escrever ou reenviar)";
    mediaUrl = transcribed.fileUrl ?? mediaUrl;
  }

  const { error: insertError } = await db.from("messages").insert({
    conversation_id: conversation.id,
    direction: "in",
    external_id: parsed.messageId ?? null,
    body,
    media_url: mediaUrl,
    media_type: parsed.messageType,
  });
  if (insertError) {
    if (insertError.code === "23505") return; // dedup: já processada (reentrega do webhook)
    await logEvent("error", "inbound", "falha ao inserir mensagem", { error: insertError.message });
    return;
  }

  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // 1ª mensagem da conversa: tenta casar com o anúncio clicado
  if (!conversation.property_id && parsed.adReferral) {
    await db.from("ad_referrals").insert({ conversation_id: conversation.id, raw: parsed.raw as never });

    // acertar o imóvel aqui muda a conversa inteira: o prompt já sabe não perguntar
    // "qual imóvel?" quando o sistema identificou pelo anúncio
    const propertyId = await casarImovelPorAnuncio(db, parsed.adReferral).catch((err) => {
      logEvent("error", "ad-match", "falha ao casar anúncio com imóvel", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

    if (propertyId) {
      await db.from("conversations").update({ property_id: propertyId }).eq("id", conversation.id);
      await logEvent("info", "ad-match", "imóvel identificado pelo anúncio", {
        conversationId: conversation.id,
        propertyId,
        origem: parsed.adReferral.entryPointConversionSource ?? "?",
        app: parsed.adReferral.sourceApp ?? "?",
      });
    }
  }

  if (isStale) return;
  if (!conversation.ai_enabled) return; // humano assumiu — bot fica quieto

  scheduleDebounced(conversation.id, () => runAgentTurn(conversation.id));
}

/**
 * fromMe = mensagem saiu do número conectado. Se foi via NOSSA api (painel/bot), `wasSentByApi`
 * é true e a gente já controla o ai_enabled na própria ação que mandou. Se for false, alguém
 * pegou o aparelho físico e respondeu direto — tratamos como assunção manual de emergência.
 */
async function handleFromMe(
  db: ReturnType<typeof createServiceClient>,
  conversationId: string,
  parsed: ParsedInboundMessage,
  rawMessage: Record<string, unknown>
) {
  const wasSentByApi = Boolean(rawMessage.wasSentByApi);
  if (wasSentByApi) return; // já registrado pela ação que enviou

  await db.from("messages").insert({
    conversation_id: conversationId,
    direction: "out",
    external_id: parsed.messageId ?? null,
    body: parsed.text || null,
    is_internal: false,
  });

  await db
    .from("conversations")
    .update({ ai_enabled: false, status: "open", last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  await logEvent("info", "handoff", "assumido manualmente pelo aparelho conectado", { conversationId });
}
