"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/log";
import { isMediaTouch, MEDIA_BUCKET, mediaTypeFromMime } from "@/lib/followup/media";

async function autenticado() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

/** Sobe (ou substitui) o áudio/vídeo de um toque da cadência. */
export async function saveFollowupMedia(touch: number, formData: FormData) {
  if (!isMediaTouch(touch)) throw new Error("Toque sem slot de mídia");
  const supabase = await autenticado();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Escolha um arquivo de áudio ou vídeo");
  const tipo = mediaTypeFromMime(file.type);
  if (!tipo) throw new Error("O arquivo precisa ser de áudio ou vídeo");

  const { data: anterior } = await supabase.from("followup_media").select("storage_path").eq("touch", touch).maybeSingle();

  // nome com timestamp: a URL muda a cada troca, então nenhum cache (CDN/uazapi) serve o arquivo velho
  const ext = file.name.split(".").pop()?.toLowerCase() || (tipo === "video" ? "mp4" : "ogg");
  const path = `toque-${touch}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
  if (upErr) {
    await logEvent("error", "cadencia-midia", "falha ao subir mídia da cadência", { touch, error: upErr.message });
    throw new Error("Não consegui subir o arquivo — tenta de novo, ou manda um arquivo menor.");
  }
  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  const { error } = await supabase.from("followup_media").upsert({
    touch,
    media_type: tipo,
    url: pub.publicUrl,
    storage_path: path,
    file_name: file.name,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  if (anterior?.storage_path && anterior.storage_path !== path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([anterior.storage_path]);
  }

  revalidatePath("/cadencia");
}

/** Tira a mídia do toque — ele volta a sair só com texto. */
export async function removeFollowupMedia(touch: number) {
  if (!isMediaTouch(touch)) throw new Error("Toque sem slot de mídia");
  const supabase = await autenticado();

  const { data: atual } = await supabase.from("followup_media").select("storage_path").eq("touch", touch).maybeSingle();
  const { error } = await supabase.from("followup_media").delete().eq("touch", touch);
  if (error) throw new Error(error.message);
  if (atual?.storage_path) await supabase.storage.from(MEDIA_BUCKET).remove([atual.storage_path]);

  revalidatePath("/cadencia");
}
