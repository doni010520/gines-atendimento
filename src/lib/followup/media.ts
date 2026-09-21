/**
 * Slots de mídia pré-gravada da cadência — globais, não por imóvel. Só os toques que a
 * spec pede com áudio/vídeo têm slot; sem arquivo cadastrado, o toque sai só com texto.
 */

export const MEDIA_BUCKET = "followup-media";

export const MEDIA_TOUCHES = [1, 3, 6] as const;
export type MediaTouch = (typeof MEDIA_TOUCHES)[number];

export const MEDIA_SLOT_LABEL: Record<MediaTouch, { titulo: string; dica: string }> = {
  1: { titulo: "Toque 1 · 24h", dica: "Simula uma tentativa de contato humano, reforçando a mensagem de retomada." },
  3: { titulo: "Toque 3 · 96h", dica: "Reforça a urgência de forma natural (procura pelo imóvel, visitas marcadas)." },
  6: { titulo: "Toque 6 · 216h", dica: "Despedida amigável, deixando a porta aberta." },
};

export function isMediaTouch(n: number): n is MediaTouch {
  return (MEDIA_TOUCHES as readonly number[]).includes(n);
}

export type FollowupMediaType = "audio" | "video";

/** Tipo do slot a partir do mimetype do arquivo enviado no painel. */
export function mediaTypeFromMime(mime: string): FollowupMediaType | null {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return null;
}
