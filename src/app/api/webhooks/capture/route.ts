import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/log";
import { extractMessages, parseUazapiMessage } from "@/lib/whatsapp/parse-webhook";
import { sendText } from "@/lib/whatsapp/uazapi";

export const dynamic = "force-dynamic";

/**
 * Webhook de CAPTURA PURA — não cria contato, não roda o agente, não responde nada
 * para quem escreveu. Só grava o payload cru em app_logs e avisa a equipe.
 *
 * Uso: o número real (11 96600-9493) fica em escuta enquanto validamos o formato do
 * payload de lead vindo de anúncio (Click to WhatsApp) antes de ligar o bot nele.
 *
 * O aviso vai pro NOTIFY_GROUP_ID, nunca pro lead — quem escreve nesse número continua
 * sem receber resposta automática.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.CAPTURE_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  await logEvent("info", "ad-referral-capture", "payload recebido", { body: raw.slice(0, 8000) });

  // o aviso é best-effort: falhar aqui nunca pode derrubar a captura, que é o que importa
  try {
    await avisarEquipe(raw);
  } catch (err) {
    await logEvent("warn", "ad-referral-capture", "falha ao avisar a equipe", {
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

async function avisarEquipe(raw: string) {
  const grupo = process.env.NOTIFY_GROUP_ID;
  if (!grupo) return;

  let evento: unknown;
  try {
    evento = JSON.parse(raw);
  } catch {
    return; // payload não-JSON: já está gravado cru, não dá pra resumir
  }

  // mesma tolerância do webhook real: o formato varia por versão/evento da uazapi, e é
  // justamente o formato de lead de anúncio que ainda não conhecemos
  const body = (evento ?? {}) as Record<string, unknown>;
  const mensagens: Record<string, unknown>[] = [];
  if (body.message && typeof body.message === "object") {
    mensagens.push(body.message as Record<string, unknown>);
  }
  mensagens.push(...extractMessages(body.data));
  if (mensagens.length === 0) mensagens.push(...extractMessages(body));

  for (const bruta of mensagens) {
    const m = parseUazapiMessage(bruta);
    if (m.fromMe || m.isGroup) continue;

    const anuncio = m.adReferral;
    const linhas = anuncio
      ? [
          "*Clique em anúncio* — alguém veio pelo tráfego",
          `Anúncio: ${anuncio.title ?? "(sem título no payload)"}`,
          anuncio.sourceId ? `ID: ${anuncio.sourceId}` : "",
          anuncio.sourceUrl ? `Link: ${anuncio.sourceUrl}` : "",
        ]
      : ["*Mensagem no número em escuta* — sem dados de anúncio no payload"];

    linhas.push(
      "",
      `De: ${m.senderName ?? "sem nome"} — ${m.phone}`,
      m.text ? `Disse: ${m.text.slice(0, 200)}` : `Tipo: ${m.messageType}`,
      "",
      "Esse número está só em escuta: ninguém respondeu essa pessoa."
    );

    await sendText(grupo, linhas.filter(Boolean).join("\n"));
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "gines-atendimento capture (só grava, não processa)" });
}
