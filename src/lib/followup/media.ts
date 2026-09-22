/**
 * Mídia pré-gravada da cadência — global (não por imóvel), uma por toque, cadastrada em
 * /cadencia e guardada em followup_touches.media_*. Toque sem arquivo sai só com texto.
 */

export const MEDIA_BUCKET = "followup-media";

export type FollowupMediaType = "audio" | "video";

/** Tipo da mídia a partir do mimetype do arquivo enviado no painel. */
export function mediaTypeFromMime(mime: string): FollowupMediaType | null {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return null;
}
