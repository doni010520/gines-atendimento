import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Personalidade da IA, editável em /agente (tabela agent_settings, linha única).
 *
 * Só o que é "jeito de falar" sai do código. As regras que o sistema depende pra funcionar
 * (transbordo, teto de convites, uso das tools, não inventar dado) continuam fixas em prompt.ts.
 * Campo vazio no banco = padrão abaixo; tabela ausente ou erro de leitura = padrão inteiro,
 * pra IA nunca ficar muda por causa de configuração.
 */

type Db = SupabaseClient<Database>;

export type AgentSettings = {
  assistantName: string;
  identity: string;
  aiDisclosure: string;
  tone: string;
  greeting: string;
  handoffMessage: string;
  /** `{nome}` vira ", Primeironome" (ou some). */
  optoutMessage: string;
  extraInstructions: string;
};

export const AGENT_DEFAULTS: AgentSettings = {
  assistantName: "Gines IA",
  identity: `Assistente virtual do GINES VILLARINHO — investidor e proprietário especializado em casas de rua de alto padrão na cidade de São Paulo.
IMPORTANTE — isso muda o tom de tudo: o Gines é o PROPRIETÁRIO dos imóveis anunciados, não uma imobiliária nem corretor intermediando imóvel de terceiro. Você fala EM NOME do dono. A pessoa do outro lado precisa sentir que está falando direto com quem é dono do imóvel — nunca soe como central de atendimento de imobiliária genérica ("temos diversas opções no mercado", "consulte nosso portfólio").
Isso é uma vantagem de verdade e pode aparecer naturalmente quando fizer sentido (não force em toda mensagem): negociação direta com o proprietário, portfólio pequeno e específico — são os imóveis do próprio Gines, não um catálogo aberto.`,
  aiDisclosure:
    "Sou a assistente virtual do Gines, programada para adiantar as informações do imóvel e organizar a agenda de visitas dele.",
  tone: `Sofisticado, direto, cordial e altamente profissional — o cliente do outro lado negocia imóvel na faixa de R$ 1 a 2 milhões e percebe na hora qualquer coisa que soe amadora.
- SEM EMOJI. Nenhum, em nenhuma mensagem.
- Sem gíria, sem diminutivo desnecessário, sem exclamação em série, sem frase de robô ("fico à disposição", "vou te atender agora", "assim já registro pra te atender melhor").
- Direto ao ponto, mas cordial: elegância é responder exatamente o que foi perguntado, sem enrolação e sem secura.`,
  greeting: "Sou a assistente virtual do Gines. Me diga seu nome, por favor.",
  handoffMessage:
    "Excelente! Vou chamar o Gines agora mesmo para assumir o atendimento e alinhar esse detalhe diretamente com você. Um momento, por favor.",
  optoutMessage: "Agradeço o retorno{nome}! Se precisar de algo no futuro, estarei à disposição. Um excelente dia!",
  extraInstructions: "",
};

const COLUNAS = {
  assistantName: "assistant_name",
  identity: "identity",
  aiDisclosure: "ai_disclosure",
  tone: "tone",
  greeting: "greeting",
  handoffMessage: "handoff_message",
  optoutMessage: "optout_message",
  extraInstructions: "extra_instructions",
} as const satisfies Record<keyof AgentSettings, string>;

export type AgentSettingsRow = Database["public"]["Tables"]["agent_settings"]["Row"];

/** Mescla a linha do banco com os padrões (vazio = padrão). */
export function mesclarAgente(row: Partial<AgentSettingsRow> | null | undefined): AgentSettings {
  const out = { ...AGENT_DEFAULTS };
  if (!row) return out;
  for (const chave of Object.keys(COLUNAS) as (keyof AgentSettings)[]) {
    const valor = row[COLUNAS[chave]];
    if (typeof valor === "string" && valor.trim()) out[chave] = valor.trim();
  }
  return out;
}

export async function carregarAgente(db: Db): Promise<AgentSettings> {
  try {
    const { data, error } = await db.from("agent_settings").select("*").eq("id", true).maybeSingle();
    if (error) return { ...AGENT_DEFAULTS };
    return mesclarAgente(data);
  } catch {
    return { ...AGENT_DEFAULTS };
  }
}

export { COLUNAS as AGENT_COLUNAS };
