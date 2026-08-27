import OpenAI from "openai";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/log";

/**
 * Os campos "[IA: inserir um destaque...]" que o Gines deixou nas copies do D1 e do D3.
 * São extraídos UMA vez por imóvel, dos dados reais cadastrados, e guardados no próprio
 * imóvel — não vale inventar acabamento que não está na base. O cache é limpo quando o
 * imóvel é editado no painel.
 */

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export type PropertyForHighlights = {
  id: string;
  title: string;
  kind: string | null;
  copy: string;
  features: string[] | null;
  area_built: number | null;
  suites: number | null;
  parking_spots: number | null;
  highlight_visual: string | null;
  highlight_tecnico: string | null;
};

const HighlightsSchema = z.object({
  visual: z.string().trim().catch(""),
  tecnico: z.string().trim().catch(""),
});

export type Highlights = z.infer<typeof HighlightsSchema>;

const REFORMA_RE = /reformad|modernizad|retrofit|reforma completa|novo em folha|nunca habitad/i;

/** A base do imóvel sustenta afirmar "100% reformada e modernizada"? */
export function pareceReformado(p: { title: string; copy: string; features: string[] | null }): boolean {
  return REFORMA_RE.test([p.title, p.copy, ...(p.features ?? [])].join(" "));
}

const SYSTEM = `Você extrai dois trechos curtos a partir dos dados REAIS de um imóvel, para encaixar em mensagens de follow-up.

Regras:
- Use SOMENTE o que está nos dados. Nunca invente acabamento, metragem ou característica.
- Cada trecho: no máximo 10 palavras, em minúsculas, sem ponto final.
- "visual": destaque visual ou arquitetônico. Precisa encaixar na frase "Acredito que ___ chamou sua atenção". Ex: "a integração da área gourmet com a varanda".
- "tecnico": diferencial técnico ou de acabamento. Precisa encaixar na frase "o imóvel já conta com ___". Ex: "marcenaria planejada nova".
- Se os dados não sustentarem um dos trechos, devolva string vazia para ele. Vazio é melhor que inventado.

Responda só com JSON: {"visual": "...", "tecnico": "..."}`;

function fallback(p: PropertyForHighlights): Highlights {
  const features = (p.features ?? []).map((f) => f.trim()).filter(Boolean);
  return {
    visual: features[0]?.toLowerCase() ?? "",
    tecnico: features[1]?.toLowerCase() ?? (p.suites ? `${p.suites} ${p.suites > 1 ? "suítes" : "suíte"}` : ""),
  };
}

export async function getHighlights(
  db: ReturnType<typeof createServiceClient>,
  property: PropertyForHighlights
): Promise<Highlights> {
  if (property.highlight_visual !== null && property.highlight_tecnico !== null) {
    return { visual: property.highlight_visual, tecnico: property.highlight_tecnico };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback(property);

  try {
    const client = new OpenAI({ apiKey });
    const dados = [
      `Título: ${property.title}`,
      `Tipo: ${property.kind ?? "não informado"}`,
      property.area_built ? `Área construída: ${property.area_built} m²` : "",
      property.suites ? `Suítes: ${property.suites}` : "",
      property.parking_spots ? `Vagas: ${property.parking_spots}` : "",
      property.features?.length ? `Características: ${property.features.join(", ")}` : "",
      `Descrição completa: ${property.copy}`,
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: dados },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = HighlightsSchema.safeParse(JSON.parse(raw));
    const highlights: Highlights = parsed.success ? parsed.data : fallback(property);

    await db
      .from("properties")
      .update({ highlight_visual: highlights.visual, highlight_tecnico: highlights.tecnico })
      .eq("id", property.id);

    return highlights;
  } catch (err) {
    await logEvent("warn", "followup", "falha ao gerar destaques do imóvel — usando o que está cadastrado", {
      propertyId: property.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback(property);
  }
}
