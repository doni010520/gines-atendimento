/**
 * Frases fixas do atendimento e os textos de reserva da cadência de follow-up.
 *
 * Os toques da cadência são escritos pela IA a partir do histórico (ver ./ai-copy.ts);
 * os modelos abaixo só saem quando a geração falha — por isso são genéricos de propósito,
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

/** Texto de reserva de cada toque (1..6), usado só se a IA falhar. */
export function copyFallback(touch: number, nome: string | null): string {
  const v = vocativo(nome);
  switch (touch) {
    case 1:
      return `Oi${v}! Passando pra retomar nossa conversa sobre o imóvel. Ficou alguma dúvida que eu possa te ajudar?`;
    case 2:
      return `Oi${v}, tudo bem? Só queria saber se ainda faz sentido pra você seguirmos com o imóvel.`;
    case 3:
      return `Oi${v}! Essa semana a procura por esse imóvel está movimentada. Se quiser conhecer, me avisa que eu já organizo uma visita pra você.`;
    case 4:
      return `Oi${v}, ficou alguma coisa que não encaixou no que você procura? Me conta que eu te ajudo a achar uma opção melhor.`;
    case 5:
      return `Oi${v}! Ainda posso te ajudar com esse imóvel ou com outra opção? É só me responder por aqui.`;
    default:
      return `Oi${v}. Como não tive retorno, estou encerrando seu atendimento por aqui. Se quiser retomar a busca, é só me chamar — fico à disposição!`;
  }
}

/** Regra de ouro: resposta negativa encerra a cadência de vez. */
export function copyOptOut(nome: string | null): string {
  return `Agradeço o retorno${vocativo(nome)}! Se precisar de algo no futuro, estarei à disposição. Um excelente dia!`;
}

/** Frase fixa de transbordo — a IA não improvisa essa. */
export const MENSAGEM_HANDOFF =
  "Excelente! Vou chamar o Gines agora mesmo para assumir o atendimento e alinhar esse detalhe diretamente com você. Um momento, por favor.";
