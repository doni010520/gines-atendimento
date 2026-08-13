// Cadastra os 3 imóveis de exemplo que o dono colocou em Documentos\GINES.
// Uso: node --env-file=.env.local scripts/seed-properties.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const BUCKET = "property-media";
const GINES_DIR = "C:\\Users\\adoni\\OneDrive\\Documentos\\GINES";

function slug(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function uploadFile(localPath, storagePath, contentType) {
  const buffer = readFileSync(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`upload falhou (${storagePath}): ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

const PROPERTIES = [
  {
    title: "Apartamento à venda – Liberdade",
    ad_ref_titles: [
      "APARTAMENTO À VENDA – LIBERDADE R$ 220.000",
      "🏡 APARTAMENTO À VENDA – LIBERDADE | R$ 220.000",
    ],
    type: "venda",
    status: "ativo",
    price: 220000,
    condo_fee: 400,
    iptu: 0,
    address: "Rua dos Estudantes, 357, apto 811",
    neighborhood: "Liberdade",
    city: "São Paulo",
    bedrooms: 1,
    suites: 1,
    parking_spots: null,
    area_built: 28,
    area_land: null,
    features: [
      "Liberado para Airbnb",
      "8º andar",
      "Sacada",
      "Cozinha americana",
      "Móveis planejados na cozinha e no banheiro",
      "Piscina",
      "Academia",
      "Espaço gourmet e churrasqueira",
      "Coworking",
      "Lavanderia compartilhada",
      "Bicicletário",
      "Próximo ao metrô Liberdade e Sé",
    ],
    copyFile: "APARTAMENTO À VENDA – LIBERDADE  R$ 220.000\\APARTAMENTO À VENDA – LIBERDADE  R$ 220.000.txt",
    videoFile: "APARTAMENTO À VENDA – LIBERDADE  R$ 220.000\\APARTAMENTO À VENDA – LIBERDADE  R$ 220.000 (2).mp4",
    pdfFile: null,
  },
  {
    title: "Casa reformada e modernizada na Vila Madalena",
    ad_ref_titles: ["CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP"],
    type: "venda",
    status: "ativo",
    price: 1989000,
    condo_fee: null,
    iptu: 575,
    address: "R. Prof. Túlio Ascarelli, 290",
    neighborhood: "Vila Madalena",
    city: "São Paulo",
    bedrooms: 3,
    suites: 3,
    parking_spots: 2,
    area_built: 189,
    area_land: null,
    features: [
      "Cozinha e churrasqueira integradas à varanda",
      "Vista pra Praça Rainha da Paz",
      "Closet",
      "Lavabo",
      "Sala living",
      "Lavanderia",
      "Escritório",
      "Cozinha gourmet integrada",
      "Horta",
      "Preparação para ar condicionado",
      "Preparação para fotovoltaica",
      "Aceita financiamento",
      "Aceita permuta/parcelamento direto com proprietário",
      "Documentos 100% em dia",
      "Perto do Parque Villa Lobos",
    ],
    copyFile:
      "CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP\\CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP.txt",
    videoFile:
      "CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP\\CASA REFORMADA E MODERNIZADA NA VILA MADALENA - SÃO PAULO - SP.mp4",
    pdfFile: null,
  },
  {
    title: "Sobrado no Brooklin - sofisticação, conforto e excelente localização",
    ad_ref_titles: ["SOBRADO NO BROOKLIN - SOFISTICAÇÃO, CONFORTO E EXCELENTE LOCALIZAÇÃO"],
    type: "venda",
    status: "ativo",
    price: 1789000,
    condo_fee: null,
    iptu: null,
    address: "Rua Professor Miguel Maurício da Rocha, 669",
    neighborhood: "Brooklin",
    city: "São Paulo",
    bedrooms: 3,
    suites: 3,
    parking_spots: 2,
    area_built: 192,
    area_land: 120,
    features: [
      "Suíte master com banheira e móveis planejados",
      "Cozinha moderna",
      "Sala de estar e jantar",
      "Lavabo",
      "Lavanderia",
      "Despejo",
      "Área de luz",
      "Pronto pra morar",
    ],
    copyFile:
      "SOBRADO NO BROOKLIN - SOFISTICAÇÃO, CONFORTO E EXCELENTE LOCALIZAÇÃO\\🏡 SOBRADO NO BROOKLIN - SOFISTICAÇÃO, CONFORTO E EXCELENTE LOCALIZAÇÃO.txt",
    videoFile:
      "SOBRADO NO BROOKLIN - SOFISTICAÇÃO, CONFORTO E EXCELENTE LOCALIZAÇÃO\\🏡 SOBRADO NO BROOKLIN - SOFISTICAÇÃO, CONFORTO E EXCELENTE LOCALIZAÇÃO.mp4",
    pdfFile: "SOBRADO NO BROOKLIN - SOFISTICAÇÃO, CONFORTO E EXCELENTE LOCALIZAÇÃO\\Sobrado reformado e modernizado R Prof Miguel Maurício (1).pdf",
  },
];

for (const p of PROPERTIES) {
  const id = randomUUID();
  const base = `${id}/${slug(p.title)}`;
  console.log(`Cadastrando: ${p.title}`);

  const copy = readFileSync(`${GINES_DIR}\\${p.copyFile}`, "utf-8").trim();
  const videoUrl = await uploadFile(`${GINES_DIR}\\${p.videoFile}`, `${base}-video.mp4`, "video/mp4");
  const pdfUrl = p.pdfFile
    ? await uploadFile(`${GINES_DIR}\\${p.pdfFile}`, `${base}-pdf.pdf`, "application/pdf")
    : null;

  const { error } = await supabase.from("properties").insert({
    id,
    title: p.title,
    type: p.type,
    status: p.status,
    price: p.price,
    condo_fee: p.condo_fee,
    iptu: p.iptu,
    address: p.address,
    neighborhood: p.neighborhood,
    city: p.city,
    bedrooms: p.bedrooms,
    suites: p.suites,
    parking_spots: p.parking_spots,
    area_built: p.area_built,
    area_land: p.area_land,
    copy,
    features: p.features,
    ad_ref_titles: p.ad_ref_titles,
    video_url: videoUrl,
    pdf_url: pdfUrl,
  });
  if (error) {
    console.error(`  falhou: ${error.message}`);
  } else {
    console.log(`  ok — id ${id}`);
  }
}

console.log("Concluído.");
