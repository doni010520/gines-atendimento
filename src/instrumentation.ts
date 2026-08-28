/**
 * Agendador interno da régua de follow-up.
 *
 * Antes isso dependia de um cron externo batendo em /api/cron — que nunca chegou a ser
 * configurado, então a régua existia mas nunca acordava. Rodando dentro do próprio
 * servidor, a régua sobe junto com o app e não depende de serviço nem conta de terceiro.
 *
 * `register` roda uma vez por instância do servidor e precisa terminar antes de o app
 * aceitar requisições — por isso aqui só arma o intervalo, sem esperar nada.
 *
 * /api/cron continua existindo e funcionando: serve pra disparo manual e pra um cron
 * externo, se um dia fizer sentido ter os dois.
 */

const INTERVALO_MS = 5 * 60 * 1000;

export async function register() {
  // instrumentation também roda no runtime edge, onde não há timer nem acesso ao banco
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // em `next dev` a régua não deve disparar sozinha — teste local é sempre deliberado
  if (process.env.NODE_ENV !== "production") return;
  // válvula de desligamento sem precisar de deploy
  if (process.env.FOLLOWUP_SCHEDULER === "off") return;

  const { runFollowupEngine } = await import("@/lib/followup/engine");
  const { logEvent } = await import("@/lib/log");

  let rodando = false;

  const tick = async () => {
    // se uma rodada estourar o intervalo, a próxima espera — duas rodadas concorrentes
    // poderiam mandar o mesmo estágio duas vezes
    if (rodando) return;
    rodando = true;
    try {
      await runFollowupEngine();
    } catch (err) {
      await logEvent("error", "scheduler", "falha na rodada do follow-up", {
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    } finally {
      rodando = false;
    }
  };

  setInterval(tick, INTERVALO_MS);

  await logEvent("info", "scheduler", "agendador da régua iniciado", {
    intervaloMin: INTERVALO_MS / 60_000,
  }).catch(() => {});
}
