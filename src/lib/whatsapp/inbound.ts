import { createServiceClient } from "@/lib/supabase/service";
import { parseUazapiMessage, type ParsedInboundMessage } from "./parse-webhook";
import { scheduleDebounced } from "./debounce";
import { runAgentTurn } from "@/lib/ai/agent";
import { casarImovelPorAnuncio } from "./match-property";
import { nomeDoFormulario } from "./formulario";
import { logEvent } from "@/lib/log";
import { sendText, downloadAndTranscribeAudio, atendidoManualmenteRecente } from "./uazapi";
import { pararCadencia } from "@/lib/followup/engine";

const STALE_MS = Number(process.env.BOT_STALE_MS ?? 5 * 60 * 1000);

/** Formatos que só contas empresariais automatizadas enviam (visto na Claro, 29/09/26). */
const TIPOS_DE_ROBO = new Set([
  "buttonsmessage",
  "listmessage",
  "templatemessage",
  "nativeflowmessage",
  "interactivemessage",
]);

const AUDIO_MESSAGE_TYPES =new Set(["audiomessage", "ptt", "audio"]);

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

/** Imóvel escolhido em /agente pra leads de anúncio que não dizem qual imóvel é. */
async function imovelDoFormulario(db: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const { data } = await db.from("agent_settings").select("imovel_formulario_id").eq("id", true).maybeSingle();
  const id = data?.imovel_formulario_id;
  if (!id) return null;
  const { data: p } = await db.from("properties").select("id,status").eq("id", id).maybeSingle();
  return p && p.status === "ativo" ? p.id : null;
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

/**
 * Conversa nova, mas o Gines já vinha falando com a pessoa direto pelo celular (ex.: números
 * que estavam fora do filtro antigo)? Então ela entra já com humano, sem a IA se apresentar
 * como se fosse lead novo. Falha na consulta = segue o fluxo normal com a IA.
 */
async function comecaComHumano(phone: string, contactId: string): Promise<boolean> {
  try {
    const manual = await atendidoManualmenteRecente(phone);
    if (manual) {
      await logEvent("info", "handoff", "conversa nova já atendida à mão no celular — IA começa desligada", {
        contactId,
      });
    }
    return manual;
  } catch (err) {
    await logEvent("warn", "inbound", "não consegui ler o histórico do chat na uazapi", {
      contactId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function getOrCreateConversation(db: ReturnType<typeof createServiceClient>, contactId: string, phone: string) {
  const { data: existing } = await db
    .from("conversations")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (existing) return existing;

  const humano = await comecaComHumano(phone, contactId);
  const { data: created, error } = await db
    .from("conversations")
    .insert(humano ? { contact_id: contactId, ai_enabled: false, status: "open" } : { contact_id: contactId })
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

  // Filtro de whitelist: se ALLOWED_NUMBERS estiver definido, ignora números fora da lista
  const allowedNumbersStr = process.env.ALLOWED_NUMBERS;
  if (allowedNumbersStr) {
    const allowedNumbers = allowedNumbersStr.split(",").map((s) => s.trim());
    if (allowedNumbers.length > 0 && !allowedNumbers.includes(parsed.phone)) {
      return;
    }
  }

  if (!parsed.fromMe && RESET_COMMAND_RE.test(parsed.text.trim())) {
    await resetConversationByPhone(db, parsed.phone);
    return;
  }

  // mensagem velha reentregue pelo provedor — persiste pra histórico, mas não dispara o bot
  const rawTs = rawMessage.messageTimestamp;
  const messageTimestamp = typeof rawTs === "number" ? rawTs : Number(rawTs ?? 0);
  const isStale = messageTimestamp > 0 && Date.now() - messageTimestamp > STALE_MS;

  const contact = await getOrCreateContact(db, parsed.phone, parsed.senderName);
  const conversation = await getOrCreateConversation(db, contact.id, parsed.phone);

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

  // lead respondeu: a cadência de follow-up para; recomeça quando o robô falar de novo
  await pararCadencia(db, conversation.id);

  // formulário do anúncio já traz o nome ("Full name: Teresa Cristina") — não pergunta de novo
  const nomeFormulario = body ? nomeDoFormulario(body) : null;
  if (nomeFormulario && !contact.name_confirmed) {
    await db.from("contacts").update({ name: nomeFormulario, name_confirmed: true }).eq("id", contact.id);
  }

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

    const imovelFinal = propertyId ?? (await imovelDoFormulario(db));
    if (!propertyId && imovelFinal) {
      await db.from("conversations").update({ property_id: imovelFinal }).eq("id", conversation.id);
      conversation.property_id = imovelFinal;
      await logEvent("info", "ad-match", "anúncio sem identificação — usado o imóvel padrão dos formulários", {
        conversationId: conversation.id,
        propertyId: imovelFinal,
      });
    }

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
  // humano assumiu (fila/aberta) ou atendimento encerrado — bot fica quieto
  if (conversation.status !== "bot" || !conversation.ai_enabled) return;

  // botão/lista/menu só sai de conta empresarial automatizada (operadora, banco...), nunca
  // de uma pessoa. Responder vira dois robôs conversando sem fim — encerra e não responde.
  if (TIPOS_DE_ROBO.has(parsed.messageType.toLowerCase())) {
    await db
      .from("conversations")
      .update({ ai_enabled: false, status: "closed", next_followup_at: null })
      .eq("id", conversation.id);
    await logEvent("warn", "inbound", "mensagem automática de empresa (botão/lista) — IA desligada nesta conversa", {
      conversationId: conversation.id,
      tipo: parsed.messageType,
    });
    return;
  }

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
