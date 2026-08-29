import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/log";
import type { AdReferralGuess } from "./parse-webhook";

type Db = ReturnType<typeof createServiceClient>;

/**
 * Descobre de qual imóvel a pessoa veio, pelo anúncio que ela clicou.
 *
 * Duas chaves, nessa ordem:
 *  1. `sourceId` — o id do anúncio na Meta. É exato e não muda se o texto do anúncio for
 *     editado, então é o casamento confiável.
 *  2. título do anúncio — reserva, pro primeiro clique de um anúncio ainda desconhecido.
 *     Quando casa por título, o `sourceId` é gravado no imóvel: o próximo clique daquele
 *     anúncio já cai no caminho exato, sem depender de o texto continuar batendo.
 */

type PropertyMatch = {
  id: string;
  title: string;
  ad_ref_titles: string[] | null;
  ad_source_ids: string[] | null;
  status: string;
};

const COLUNAS = "id,title,ad_ref_titles,ad_source_ids,status";

/** Tira acento, caixa e pontuação — títulos de anúncio vêm em CAIXA ALTA e com emoji. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quanto das palavras do menor título aparecem no maior (0 a 1). */
function sobreposicao(a: string, b: string): number {
  const pa = new Set(a.split(" ").filter((p) => p.length > 2));
  const pb = new Set(b.split(" ").filter((p) => p.length > 2));
  if (pa.size === 0 || pb.size === 0) return 0;
  const [menor, maior] = pa.size <= pb.size ? [pa, pb] : [pb, pa];
  let comuns = 0;
  for (const p of menor) if (maior.has(p)) comuns++;
  return comuns / menor.size;
}

const LIMIAR_TITULO = 0.7;

function casarPorTitulo(imoveis: PropertyMatch[], tituloAnuncio: string): PropertyMatch | null {
  const alvo = normalizar(tituloAnuncio);
  if (!alvo) return null;

  let melhor: { imovel: PropertyMatch; nota: number } | null = null;

  for (const imovel of imoveis) {
    const candidatos = [imovel.title, ...(imovel.ad_ref_titles ?? [])].filter(Boolean).map(normalizar);
    for (const c of candidatos) {
      if (!c) continue;
      const nota = c === alvo ? 1 : c.includes(alvo) || alvo.includes(c) ? 0.9 : sobreposicao(alvo, c);
      if (nota >= LIMIAR_TITULO && (!melhor || nota > melhor.nota)) melhor = { imovel, nota };
    }
  }

  return melhor?.imovel ?? null;
}

/**
 * @returns id do imóvel, ou null quando não dá pra afirmar de qual imóvel se trata —
 * nesse caso o bot pergunta normalmente, que é melhor que mandar o material errado.
 */
export async function casarImovelPorAnuncio(db: Db, referral: AdReferralGuess): Promise<string | null> {
  const { data, error } = await db.from("properties").select(COLUNAS);
  if (error || !data || data.length === 0) return null;

  const imoveis = data as PropertyMatch[];

  if (referral.sourceId) {
    const porId = imoveis.find((i) => (i.ad_source_ids ?? []).includes(referral.sourceId as string));
    if (porId) return porId.id;
  }

  if (!referral.title) return null;

  const porTitulo = casarPorTitulo(imoveis, referral.title);
  if (!porTitulo) {
    await logEvent("warn", "ad-match", "anúncio não bateu com nenhum imóvel", {
      titulo: referral.title,
      sourceId: referral.sourceId,
    });
    return null;
  }

  // aprende o id do anúncio pro próximo clique não depender do texto
  if (referral.sourceId && !(porTitulo.ad_source_ids ?? []).includes(referral.sourceId)) {
    await db
      .from("properties")
      .update({ ad_source_ids: [...(porTitulo.ad_source_ids ?? []), referral.sourceId] })
      .eq("id", porTitulo.id);
    await logEvent("info", "ad-match", "anúncio novo aprendido e vinculado ao imóvel", {
      imovel: porTitulo.title,
      sourceId: referral.sourceId,
      titulo: referral.title,
    });
  }

  return porTitulo.id;
}
