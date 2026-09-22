import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Toques da cadência, editáveis em /cadencia (tabela followup_touches).
 *
 * A ordem é SEMPRE o delay em horas (contadas da âncora). A conversa guarda só as horas do
 * último toque enviado (followup_last_touch_hours); o próximo é o primeiro toque ativo com
 * delay maior. Assim incluir, remover, desativar ou mudar horas no meio da cadência nunca
 * reenvia toque passado — no máximo o próximo muda.
 */

type Db = SupabaseClient<Database>;

export type Toque = Database["public"]["Tables"]["followup_touches"]["Row"];
export type ConfigCadencia = { finalTag: string; applyFinalTag: boolean };

export const TAG_PADRAO = "Perdido por Falta de Retorno";

/** Toques ativos, na ordem da cadência (delay crescente). */
export async function carregarToquesAtivos(db: Db): Promise<Toque[]> {
  const { data, error } = await db
    .from("followup_touches")
    .select("*")
    .eq("active", true)
    .order("delay_hours", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw new Error(`falha ao carregar toques da cadência: ${error.message}`);
  return data ?? [];
}

export async function carregarConfig(db: Db): Promise<ConfigCadencia> {
  const { data } = await db.from("followup_settings").select("final_tag,apply_final_tag").eq("id", true).maybeSingle();
  return {
    finalTag: data?.final_tag?.trim() || TAG_PADRAO,
    applyFinalTag: data?.apply_final_tag ?? true,
  };
}

/** Próximo toque depois de `ultimoHoras` (0 = nenhum enviado ainda). null = cadência acabou. */
export function proximoToque(toques: Toque[], ultimoHoras: number): Toque | null {
  return toques.find((t) => Number(t.delay_hours) > Number(ultimoHoras)) ?? null;
}

/** Posição 1-based do toque na cadência ativa ("toque X de N"). */
export function indiceDoToque(toques: Toque[], toqueId: string): number {
  return toques.findIndex((t) => t.id === toqueId) + 1;
}

/** "Dia 4" (96h), "Dia 1,5" (36h) — só um apoio visual pras horas. */
export function rotuloDias(horas: number): string {
  const dias = Number(horas) / 24;
  const texto = Number.isInteger(dias) ? String(dias) : dias.toFixed(1).replace(".", ",");
  return `Dia ${texto}`;
}
