/**
 * Frases fixas do atendimento e os textos de reserva da cadência de follow-up.
 *
 * Os toques da cadência são escritos pela IA a partir do histórico (ver ./ai-copy.ts);
 * os textos de reserva (cadastrados por toque em /cadencia) só saem quando a geração falha — por isso são genéricos de propósito,
 * sem afirmar nada sobre o imóvel que possa não ser verdade.
 */

/**
 * Só o primeiro nome — "Olá, Adonias Santos!" (como saiu no teste real de 28/08) soa
 * cadastro de call center, não alguém falando com você.
 */
function vocativo(nome: string | null) {
  const primeiro = nome?.trim().split(/\s+/)[0];
  return primeiro ? `, ${primeiro}` : "";
}

/** Reserva quando o toque não tem texto próprio cadastrado. */
const FALLBACK_GENERICO = "Oi{nome}! Passando pra saber se ainda posso te ajudar com o imóvel. É só me responder por aqui.";

/**
 * Texto de reserva do toque, usado só se a IA falhar. Vem do painel (/cadencia);
 * `{nome}` vira ", Primeironome" (ou some, se não souber o nome).
 */
export function copyFallback(texto: string | null | undefined, nome: string | null): string {
  const modelo = texto?.trim() || FALLBACK_GENERICO;
  return modelo.replace(/\{nome\}/g, vocativo(nome));
}

/** Regra de ouro: resposta negativa encerra a cadência de vez. */
export function copyOptOut(nome: string | null): string {
  return `Agradeço o retorno${vocativo(nome)}! Se precisar de algo no futuro, estarei à disposição. Um excelente dia!`;
}

/** Frase fixa de transbordo — a IA não improvisa essa. */
export const MENSAGEM_HANDOFF =
  "Excelente! Vou chamar o Gines agora mesmo para assumir o atendimento e alinhar esse detalhe diretamente com você. Um momento, por favor.";
