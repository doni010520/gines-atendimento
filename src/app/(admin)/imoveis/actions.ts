"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type PropertyStatus = Database["public"]["Enums"]["property_status"];
type PropertyType = Database["public"]["Enums"]["property_type"];

const BUCKET = "property-media";
const VALID_STATUSES: PropertyStatus[] = ["ativo", "reservado", "vendido", "inativo"];

function slug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function uploadIfPresent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  file: File | null,
  path: string
): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const ext = file.name.split(".").pop() || "bin";
  const fullPath = `${path}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(fullPath, file, { upsert: true });
  if (error) throw new Error(`upload falhou (${fullPath}): ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
  return data.publicUrl;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (!v || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const n = numberOrNull(v);
  return n === null ? null : Math.round(n);
}

export async function saveProperty(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Título é obrigatório");
  const copy = String(formData.get("copy") ?? "").trim();
  if (!copy) throw new Error("Copy é obrigatória");

  const propertyId = id || crypto.randomUUID();
  const basePath = `${propertyId}/${slug(title)}`;

  const [videoUrl, pdfUrl] = await Promise.all([
    uploadIfPresent(supabase, formData.get("video") as File | null, `${basePath}-video`),
    uploadIfPresent(supabase, formData.get("pdf") as File | null, `${basePath}-pdf`),
  ]);

  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  const photoUrls: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const url = await uploadIfPresent(supabase, fotos[i], `${basePath}-foto-${i + 1}`);
    if (url) photoUrls.push(url);
  }

  const features = String(formData.get("features") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const adRefTitles = String(formData.get("ad_ref_titles") ?? title)
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const payload = {
    title,
    kind: (formData.get("kind") as string)?.trim() || null,
    type: ((formData.get("type") as string) === "locacao" ? "locacao" : "venda") as PropertyType,
    status: (VALID_STATUSES.includes(formData.get("status") as PropertyStatus)
      ? (formData.get("status") as PropertyStatus)
      : "ativo") as PropertyStatus,
    price: numberOrNull(formData.get("price")),
    condo_fee: numberOrNull(formData.get("condo_fee")),
    iptu: numberOrNull(formData.get("iptu")),
    address: (formData.get("address") as string) || null,
    neighborhood: (formData.get("neighborhood") as string) || null,
    city: (formData.get("city") as string) || "São Paulo",
    bedrooms: intOrNull(formData.get("bedrooms")),
    suites: intOrNull(formData.get("suites")),
    parking_spots: intOrNull(formData.get("parking_spots")),
    area_built: numberOrNull(formData.get("area_built")),
    area_land: numberOrNull(formData.get("area_land")),
    copy,
    features,
    ad_ref_titles: adRefTitles,
    ...(videoUrl ? { video_url: videoUrl } : {}),
    ...(pdfUrl ? { pdf_url: pdfUrl } : {}),
    ...(photoUrls.length ? { photo_urls: photoUrls } : {}),
  };

  if (id) {
    const { error } = await supabase.from("properties").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("properties")
      .insert({ id: propertyId, ...payload, created_by: user.id });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/imoveis");
  redirect("/imoveis");
}

export async function setPropertyStatus(id: string, status: string) {
  if (!VALID_STATUSES.includes(status as PropertyStatus)) throw new Error("status inválido");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("properties").update({ status: status as PropertyStatus }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/imoveis");
}
