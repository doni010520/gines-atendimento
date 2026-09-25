"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AGENT_COLUNAS, AGENT_DEFAULTS, type AgentSettings } from "@/lib/ai/agent-settings";

async function autenticado() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

const LIMITES: Record<keyof AgentSettings, number> = {
  assistantName: 60,
  identity: 3000,
  aiDisclosure: 400,
  tone: 3000,
  greeting: 400,
  handoffMessage: 400,
  optoutMessage: 400,
  extraInstructions: 4000,
};

/**
 * Salva a personalidade. Texto igual ao padrão (ou vazio) vira null no banco — assim,
 * se o padrão do código mudar depois, quem nunca mexeu naquele campo acompanha.
 */
export async function saveAgent(formData: FormData) {
  const supabase = await autenticado();
  const linha: Record<string, string | null> = {};

  for (const chave of Object.keys(AGENT_COLUNAS) as (keyof AgentSettings)[]) {
    const valor = String(formData.get(chave) ?? "").replace(/\r\n/g, "\n").trim();
    if (valor.length > LIMITES[chave]) throw new Error(`Campo muito longo (máx. ${LIMITES[chave]} caracteres)`);
    linha[AGENT_COLUNAS[chave]] = !valor || valor === AGENT_DEFAULTS[chave] ? null : valor;
  }

  const { error } = await supabase
    .from("agent_settings")
    .upsert({ id: true, ...linha, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/agente");
}

/** Volta tudo pro comportamento original. */
export async function resetAgent() {
  const supabase = await autenticado();
  const vazio = Object.fromEntries(Object.values(AGENT_COLUNAS).map((c) => [c, null]));
  const { error } = await supabase
    .from("agent_settings")
    .upsert({ id: true, ...vazio, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/agente");
}
