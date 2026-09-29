import { createServiceClient } from "@/lib/supabase/service";
import { sendText } from "@/lib/whatsapp/uazapi";
import { logEvent } from "@/lib/log";

/**
 * Checagem de saúde do Supabase, independente do resto do app.
 *
 * Importante: `logEvent` também escreve no Supabase — se o banco caiu, logar o problema
 * lá dentro não adianta nada. Por isso esse alerta vai direto pro WhatsApp via uazapi,
 * que não depende do Supabase pra nada.
 *
 * Isso cobre "Supabase fora do ar enquanto o servidor está de pé" (projeto pausado por
 * inatividade, chave revogada, etc.). NÃO cobre o servidor inteiro cair — pra isso é
 * preciso um monitor externo de verdade, batendo na URL pública de fora da VPS.
 */

let falhando = false;
let ultimoAlertaEm = 0;
const REALERTA_MS = 30 * 60 * 1000; // não repete alerta antes de 30min, mesmo se continuar fora

export async function checkSupabaseHealth() {
  const grupo = process.env.NOTIFY_GROUP_ID;
  if (!grupo) return; // sem grupo configurado, não tem pra quem avisar

  try {
    const db = createServiceClient();
    const { error } = await db.from("app_logs").select("id").limit(1);
    if (error) throw new Error(error.message);

    if (falhando) {
      falhando = false;
      await sendText(grupo, "✅ Robô voltou a conseguir falar com o Supabase.").catch(() => {});
    }
  } catch (err) {
    const agora = Date.now();
    const primeiraFalha = !falhando;
    falhando = true;

    if (primeiraFalha || agora - ultimoAlertaEm > REALERTA_MS) {
      ultimoAlertaEm = agora;
      const motivo = err instanceof Error ? err.message : String(err);
      await sendText(
        grupo,
        `⚠️ Robô não está conseguindo falar com o Supabase (${motivo}). Verifique se o projeto foi pausado por inatividade no painel do Supabase.`
      ).catch(() => {});
    }

    // tentativa best-effort de registrar no log — se o banco estiver mesmo fora, isso cai
    // no fallback pro stderr dentro do próprio logEvent, sem quebrar nada
    await logEvent("error", "monitor", "Supabase não respondeu ao health-check", {
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }
}
