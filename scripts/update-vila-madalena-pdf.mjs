import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: property, error: findErr } = await supabase
  .from("properties")
  .select("id,title")
  .ilike("title", "%Vila Madalena%")
  .single();
if (findErr || !property) {
  console.error("imóvel não encontrado:", findErr?.message);
  process.exit(1);
}
console.log("achou:", property.title, property.id);

const path =
  "C:\\Users\\adoni\\OneDrive\\Documentos\\GINES\\CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP\\CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP.pdf";
const buffer = readFileSync(path);
const storagePath = `${property.id}/casa-vila-madalena-pdf.pdf`;

const { error: upErr } = await supabase.storage
  .from("property-media")
  .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
if (upErr) {
  console.error("upload falhou:", upErr.message);
  process.exit(1);
}

const { data: pub } = supabase.storage.from("property-media").getPublicUrl(storagePath);
const { error: updErr } = await supabase.from("properties").update({ pdf_url: pub.publicUrl }).eq("id", property.id);
if (updErr) {
  console.error("update falhou:", updErr.message);
  process.exit(1);
}

console.log("PDF atualizado:", pub.publicUrl);
