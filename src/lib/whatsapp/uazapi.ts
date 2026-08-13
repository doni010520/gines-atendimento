/**
 * Cliente fino para a uazapi (WhatsApp não-oficial).
 * Referência: https://{subdomain}.uazapi.com — auth via header `token` (instância).
 */

function baseUrl() {
  const url = process.env.UAZAPI_BASE_URL;
  if (!url) throw new Error("UAZAPI_BASE_URL não configurada");
  return url.replace(/\/$/, "");
}

function token() {
  const t = process.env.UAZAPI_TOKEN;
  if (!t) throw new Error("UAZAPI_TOKEN não configurada");
  return t;
}

async function uazRequest(path: string, body: Record<string, unknown>, attempt = 1): Promise<unknown> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: token(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    // retry só em erro transitório (5xx) — 4xx é erro de payload/instância, não adianta repetir
    if (res.status >= 500 && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      return uazRequest(path, body, attempt + 1);
    }
    const errText = await res.text().catch(() => "");
    throw new Error(`uazapi ${path} falhou (${res.status}): ${errText.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/** Normaliza telefone BR pro formato que a uazapi espera (DDI+DDD+número, sem símbolos). */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function sendText(number: string, text: string) {
  return uazRequest("/send/text", { number: normalizePhone(number), text });
}

export type MediaType = "image" | "video" | "document" | "audio" | "ptt";

export async function sendMedia(params: {
  number: string;
  type: MediaType;
  file: string; // URL pública (Supabase Storage) ou base64
  text?: string;
  docName?: string;
}) {
  return uazRequest("/send/media", {
    number: normalizePhone(params.number),
    type: params.type,
    file: params.file,
    text: params.text,
    docName: params.docName,
  });
}

export async function sendPresence(number: string, presence: "composing" | "paused" = "composing") {
  return uazRequest("/send/presence", { number: normalizePhone(number), presence }).catch(() => {
    // presença é cosmético — nunca deixa isso quebrar o fluxo
  });
}

/**
 * Baixa mídia de uma mensagem (a uazapi decripta o arquivo original do WhatsApp) e,
 * pra áudio, já pede transcrição via Whisper embutido nela mesma — evita a gente ter
 * que lidar com decriptação de mídia do protocolo do WhatsApp na unha.
 */
export async function downloadAndTranscribeAudio(
  messageId: string
): Promise<{ text: string | null; fileUrl: string | null }> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const result = (await uazRequest("/message/download", {
    id: messageId,
    transcribe: true,
    return_link: true,
    generate_mp3: true,
    ...(openaiKey ? { openai_apikey: openaiKey } : {}),
  })) as { fileURL?: string; transcription?: string };

  return {
    text: typeof result.transcription === "string" && result.transcription.trim() ? result.transcription.trim() : null,
    fileUrl: typeof result.fileURL === "string" && result.fileURL ? result.fileURL : null,
  };
}
