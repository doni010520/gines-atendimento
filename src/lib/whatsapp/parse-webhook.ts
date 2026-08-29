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
  /** id do anúncio — estável, não muda se o texto do anúncio for editado */
  sourceId?: string;
  mediaType?: string;
  /** instagram | facebook */
  sourceApp?: string;
  /** "ad" quando é anúncio pago */
  sourceType?: string;
  /** ctwa_ad = anúncio | click_to_chat_link = link wa.me comum */
  entryPointConversionSource?: string;
  /** FB_Ads */
  conversionSource?: string;
  /** id único do clique, serve pra atribuição */
  ctwaClid?: string;
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

/** Aceita string ou número — mediaType vem como número, sourceID como string. */
function texto(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/**
 * Acha o nó que carrega os dados do anúncio e devolve ele junto do pai (contextInfo) —
 * porque metade da informação fica em cada um: `externalAdReply` traz título/id/URL do
 * anúncio, e o `contextInfo` em volta traz de onde veio o clique (conversionSource,
 * entryPointConversionSource).
 */
function acharContextoAnuncio(
  node: unknown,
  depth = 0
): { anuncio: Record<string, unknown>; contexto: Record<string, unknown> } | undefined {
  if (depth > 8 || !node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;

  const anuncio = obj["externalAdReplyInfo"] ?? obj["externalAdReply"] ?? obj["ctwaContext"];
  if (anuncio && typeof anuncio === "object") {
    return { anuncio: anuncio as Record<string, unknown>, contexto: obj };
  }

  for (const key of Object.keys(obj)) {
    const found = acharContextoAnuncio(obj[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Monta o referral a partir do payload real da Meta.
 *
 * CONFIRMADO com tráfego real em 29/08/26 (anúncio de Instagram do sobrado do Brooklin):
 * as chaves vêm como `sourceID`, `sourceURL` e `thumbnailURL` — com ID/URL em maiúsculo.
 * A versão anterior procurava `sourceId`/`sourceUrl` e perdia justamente o identificador
 * do anúncio, que é o casamento confiável com o imóvel. As duas grafias são aceitas.
 */
function findExternalAdReply(node: unknown): AdReferralGuess | undefined {
  const achado = acharContextoAnuncio(node);
  if (!achado) return undefined;
  const { anuncio: d, contexto: ctx } = achado;

  return {
    title: texto(d.title),
    body: texto(d.body),
    // `thumbnail` é base64 e não serve como URL — só entra se vier URL de verdade
    thumbnailUrl: texto(d.thumbnailURL) ?? texto(d.thumbnailUrl),
    sourceUrl: texto(d.sourceURL) ?? texto(d.sourceUrl),
    sourceId: texto(d.sourceID) ?? texto(d.sourceId),
    mediaType: texto(d.mediaType),
    sourceApp: texto(d.sourceApp) ?? texto(ctx.entryPointConversionApp),
    sourceType: texto(d.sourceType),
    entryPointConversionSource: texto(ctx.entryPointConversionSource),
    conversionSource: texto(ctx.conversionSource),
    ctwaClid: texto(d.ctwaClid) ?? texto(ctx.ctwaClid) ?? texto(ctx.ctwa_clid),
  };
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
