/**
 * Debounce + mutex por conversa, em memória (processo Node único e persistente —
 * mesmo padrão do Corrêa/MVF). Junta rajadas de mensagens ("Oi", "Boa tarde"...) num só
 * turno, e serializa turnos da mesma conversa pra nunca rodar dois em paralelo.
 */

const DEBOUNCE_MS = Number(process.env.BOT_DEBOUNCE_MS ?? 8000);
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const chains = new Map<string, Promise<unknown>>();

/**
 * Agenda `fn` pra rodar `DEBOUNCE_MS` depois da ÚLTIMA chamada para essa conversationId.
 * Chamadas repetidas dentro da janela cancelam o timer anterior (só a última dispara).
 */
export function scheduleDebounced(conversationId: string, fn: () => Promise<void>) {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    timers.delete(conversationId);
    void runExclusive(conversationId, fn);
  }, DEBOUNCE_MS);

  timers.set(conversationId, timer);
}

/** Encadeia execuções da mesma conversa — nunca deixa 2 turnos rodarem juntos. */
export function runExclusive(conversationId: string, fn: () => Promise<void>): Promise<void> {
  const previous = chains.get(conversationId) ?? Promise.resolve();
  const next = previous
    .catch(() => {
      // erro do turno anterior não deve travar os próximos
    })
    .then(fn);
  chains.set(
    conversationId,
    next.finally(() => {
      if (chains.get(conversationId) === next) chains.delete(conversationId);
    })
  );
  return next;
}
