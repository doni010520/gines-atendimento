"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/log";
import { MEDIA_BUCKET, mediaTypeFromMime } from "@/lib/followup/media";
import { reagendarCadencias } from "@/lib/followup/engine";
import { TAG_PADRAO } from "@/lib/followup/touches";

async function autenticado() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

/**
 * Depois de mexer na lista de toques, recalcula a agenda de quem está no meio da cadência.
 * Usa o service client (já autenticado acima): percorre conversas de todo mundo.
 * Falha aqui não desfaz a edição — o motor recalcula de qualquer jeito na hora de enviar.
 */
async function aplicarNasConversas() {
  try {
    await reagendarCadencias(createServiceClient());
  } catch (err) {
    await logEvent("error", "cadencia", "falha ao reagendar conversas após editar a cadência", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  revalidatePath("/cadencia");
}

function lerHoras(formData: FormData): number {
  const bruto = String(formData.get("delay_hours") ?? "").replace(",", ".").trim();
  const horas = Number(bruto);
  if (!bruto || !Number.isFinite(horas) || horas <= 0) throw new Error("As horas precisam ser um número maior que zero");
  if (horas > 24 * 365) throw new Error("No máximo 1 ano (8760h) depois da última mensagem");
  return Math.round(horas * 100) / 100;
}

function lerTexto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

async function horasEmUso(supabase: Awaited<ReturnType<typeof autenticado>>, horas: number, excetoId?: string) {
  let q = supabase.from("followup_touches").select("id").eq("delay_hours", horas);
  if (excetoId) q = q.neq("id", excetoId);
  const { data } = await q.limit(1);
  return (data ?? []).length > 0;
}

/** Novo toque (entra ativo, sem mídia). */
export async function addTouch(formData: FormData) {
  const supabase = await autenticado();
  const horas = lerHoras(formData);
  const objetivo = lerTexto(formData, "objective");
  if (!objetivo) throw new Error("Escreva o objetivo do toque — é o que a IA segue pra escrever a mensagem");
  if (await horasEmUso(supabase, horas)) throw new Error(`Já existe um toque em ${horas}h`);

  const { data: ultimo } = await supabase
    .from("followup_touches")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("followup_touches").insert({
    delay_hours: horas,
    objective: objetivo,
    fallback_text: lerTexto(formData, "fallback_text") || null,
    position: (ultimo?.position ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  await aplicarNasConversas();
}

/** Edita horas, objetivo, texto de reserva e se o toque está ativo. */
export async function updateTouch(id: string, formData: FormData) {
  const supabase = await autenticado();
  const horas = lerHoras(formData);
  const objetivo = lerTexto(formData, "objective");
  if (!objetivo) throw new Error("O objetivo do toque não pode ficar vazio");
  if (await horasEmUso(supabase, horas, id)) throw new Error(`Já existe outro toque em ${horas}h`);

  const { error } = await supabase
    .from("followup_touches")
    .update({
      delay_hours: horas,
      objective: objetivo,
      fallback_text: lerTexto(formData, "fallback_text") || null,
      active: formData.get("active") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await aplicarNasConversas();
}

/** Remove o toque (e o arquivo dele, se tiver). */
export async function deleteTouch(id: string) {
  const supabase = await autenticado();
  const { data: atual } = await supabase.from("followup_touches").select("media_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("followup_touches").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (atual?.media_path) await supabase.storage.from(MEDIA_BUCKET).remove([atual.media_path]);
  await aplicarNasConversas();
}

/** Sobe (ou substitui) o áudio/vídeo de um toque. */
export async function saveTouchMedia(id: string, formData: FormData) {
  const supabase = await autenticado();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Escolha um arquivo de áudio ou vídeo");
  const tipo = mediaTypeFromMime(file.type);
  if (!tipo) throw new Error("O arquivo precisa ser de áudio ou vídeo");

  const { data: anterior } = await supabase.from("followup_touches").select("media_path").eq("id", id).maybeSingle();
  if (!anterior) throw new Error("Toque não encontrado");

  // nome com timestamp: a URL muda a cada troca, então nenhum cache (CDN/uazapi) serve o arquivo velho
  const ext = file.name.split(".").pop()?.toLowerCase() || (tipo === "video" ? "mp4" : "ogg");
  const path = `toque-${id}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
  if (upErr) {
    await logEvent("error", "cadencia-midia", "falha ao subir mídia da cadência", { toque: id, error: upErr.message });
    throw new Error("Não consegui subir o arquivo — tenta de novo, ou manda um arquivo menor.");
  }
  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

  const { error } = await supabase
    .from("followup_touches")
    .update({
      media_kind: tipo,
      media_url: pub.publicUrl,
      media_path: path,
      media_file_name: file.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (anterior.media_path && anterior.media_path !== path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([anterior.media_path]);
  }

  revalidatePath("/cadencia");
}

/** Tira a mídia do toque — ele volta a sair só com texto. */
export async function removeTouchMedia(id: string) {
  const supabase = await autenticado();

  const { data: atual } = await supabase.from("followup_touches").select("media_path").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("followup_touches")
    .update({ media_kind: null, media_url: null, media_path: null, media_file_name: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (atual?.media_path) await supabase.storage.from(MEDIA_BUCKET).remove([atual.media_path]);

  revalidatePath("/cadencia");
}

/** Etiqueta que a conversa recebe quando o último toque sai sem retorno. */
export async function saveFinalTag(formData: FormData) {
  const supabase = await autenticado();
  const etiqueta = lerTexto(formData, "final_tag") || TAG_PADRAO;
  if (etiqueta.length > 60) throw new Error("Etiqueta muito longa (máx. 60 caracteres)");

  const { error } = await supabase.from("followup_settings").upsert({
    id: true,
    final_tag: etiqueta,
    apply_final_tag: formData.get("apply_final_tag") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cadencia");
}
