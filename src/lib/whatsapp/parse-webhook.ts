/**
 * Parsing tolerante do webhook da uazapi — o formato de `data` varia por versão/evento,
 * então nunca confiamos numa forma fixa (mesma lição aplicada no Corrêa/MVF).
 */

export type ParsedInboundMessage = {
  chatId: string;
  phone: string;
  senderName?: string;
  isGroup: boolean;
  fromMe: boolean;
  messageId?: string;
  messageType: string;
  text: string;
  fileUrl?: string;
  /** payload bruto — sempre guardamos, mesmo sem saber extrair tudo ainda */
  raw: unknown;
  /** candidato a referral de anúncio (Click to WhatsApp), se achado */
  adReferral?: AdReferralGuess;
};

export type AdReferralGuess = {
  title?: string;
  body?: string;
  thumbnailUrl?: string;
  sourceUrl?: string;
  sourceId?: string;
  mediaType?: string;
};

function digObject(obj: unknown): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  if (typeof obj === "string") {
    try {
      return JSON.parse(obj);
    } catch {
      return undefined;
    }
  }
  if (typeof obj === "object") return obj as Record<string, unknown>;
  return undefined;
}

/**
 * Procura contextInfo.externalAdReplyInfo em qualquer profundidade razoável do content bruto.
 * uazapi (Baileys por baixo) tende a repassar o objeto de protocolo original em `content`;
 * a forma exata (extendedTextMessage / imageMessage / etc.) varia conforme o tipo de mensagem
 * que a pessoa clicou no anúncio — por isso a busca é recursiva e defensiva.
 * NÃO CONFIRMADO em produção ainda: validar com uma mensagem real antes de confiar 100% nisso.
 */
function findExternalAdReply(node: unknown, depth = 0): AdReferralGuess | undefined {
  if (depth > 6 || !node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;

  const direct = obj["externalAdReplyInfo"] ?? obj["externalAdReply"] ?? obj["ctwaContext"];
  if (direct && typeof direct === "object") {
    const d = direct as Record<string, unknown>;
    return {
      title: typeof d.title === "string" ? d.title : undefined,
      body: typeof d.body === "string" ? d.body : undefined,
      thumbnailUrl:
        (typeof d.thumbnailUrl === "string" && d.thumbnailUrl) ||
        (typeof d.thumbnail === "string" && d.thumbnail) ||
        undefined,
      sourceUrl: typeof d.sourceUrl === "string" ? d.sourceUrl : undefined,
      sourceId: typeof d.sourceId === "string" ? d.sourceId : undefined,
      mediaType: typeof d.mediaType === "string" ? d.mediaType : undefined,
    };
  }

  for (const key of Object.keys(obj)) {
    const found = findExternalAdReply(obj[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function extractText(content: Record<string, unknown> | undefined, fallback: string): string {
  if (!content) return fallback;
  const candidates = [
    content.text,
    content.caption,
    (content.extendedTextMessage as Record<string, unknown> | undefined)?.text,
    (content.conversation as unknown) as string,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return fallback;
}

export function parseUazapiMessage(rawMessage: Record<string, unknown>): ParsedInboundMessage {
  const chatId = String(rawMessage.chatid ?? rawMessage.chatId ?? rawMessage.sender ?? "");
  const phone = chatId.split("@")[0] ?? chatId;
  const content = digObject(rawMessage.content);

  return {
    chatId,
    phone,
    senderName: typeof rawMessage.senderName === "string" ? rawMessage.senderName : undefined,
    isGroup: Boolean(rawMessage.isGroup),
    fromMe: Boolean(rawMessage.fromMe),
    messageId: typeof rawMessage.messageid === "string" ? rawMessage.messageid : undefined,
    messageType: typeof rawMessage.messageType === "string" ? rawMessage.messageType : "unknown",
    text: extractText(content, typeof rawMessage.text === "string" ? rawMessage.text : ""),
    fileUrl: typeof rawMessage.fileURL === "string" ? rawMessage.fileURL : undefined,
    raw: rawMessage,
    adReferral: content ? findExternalAdReply(content) : undefined,
  };
}

/** O body do webhook pode trazer 1 mensagem ou uma lista — normaliza pra sempre um array. */
export function extractMessages(eventData: unknown): Record<string, unknown>[] {
  if (!eventData || typeof eventData !== "object") return [];
  const data = eventData as Record<string, unknown>;

  if (Array.isArray(data.messages)) return data.messages as Record<string, unknown>[];
  if (Array.isArray(data)) return data as unknown as Record<string, unknown>[];
  if (data.message && typeof data.message === "object") return [data.message as Record<string, unknown>];
  // fallback: o próprio `data` já é a mensagem
  if (data.chatid || data.messageid || data.text !== undefined) return [data];
  return [];
}
