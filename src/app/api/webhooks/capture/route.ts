import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Webhook de CAPTURA PURA — não cria contato, não roda o agente, não responde nada, e não
 * avisa ninguém. Só grava o payload cru em app_logs.
 *
 * Uso: o número real (11 96600-9493) fica em escuta enquanto validamos o formato do
 * payload de lead vindo de anúncio (Click to WhatsApp) antes de ligar o bot nele.
 *
 * Chegou a mandar aviso no grupo (28/08), removido no mesmo dia a pedido do dono: escuta
 * silenciosa, sem notificar ninguém. O histórico do git guarda a versão com aviso.
 */
/** Chaves que a Meta/Baileys usam pra marcar de onde a conversa veio. */
const CHAVES_ANUNCIO = [
  "externalAdReplyInfo",
  "externalAdReply",
  "ctwaContext",
  "ctwa_clid",
  "entryPointConversionSource",
  "entryPointConversionApp",
  "entryPointConversionDelaySeconds",
  "sourceId",
  "sourceUrl",
  "conversionSource",
];

/**
 * Varre o payload atrás dos marcadores de origem, em qualquer profundidade — inclusive
 * dentro de campos que vêm como string JSON, que é como a uazapi manda `content`.
 */
function acharMarcadores(
  node: unknown,
  prof = 0,
  achados: Record<string, unknown> = {}
): Record<string, unknown> {
  if (prof > 12 || node === null || node === undefined) return achados;

  if (typeof node === "string") {
    const t = node.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        acharMarcadores(JSON.parse(t), prof + 1, achados);
      } catch {
        /* string que só parece JSON — ignora */
      }
    }
    return achados;
  }

  if (typeof node !== "object") return achados;

  for (const [chave, valor] of Object.entries(node as Record<string, unknown>)) {
    if (CHAVES_ANUNCIO.includes(chave)) achados[chave] = valor;
    acharMarcadores(valor, prof + 1, achados);
  }
  return achados;
}

/**
 * Corte generoso, mas ainda com teto: mensagem de mídia pode trazer thumbnail em base64 e
 * estourar o log. O corte anterior era de 8.000 e comeu justamente o payload de um provável
 * clique em anúncio (29/08) — por isso os marcadores são extraídos ANTES do corte e vão
 * gravados à parte: mesmo truncado, o dado que interessa sobrevive.
 */
const LIMITE_CORPO = 60_000;

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.CAPTURE_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();

  let marcadores: Record<string, unknown> = {};
  try {
    marcadores = acharMarcadores(JSON.parse(raw));
  } catch {
    /* payload não-JSON: fica só o corpo cru mesmo */
  }

  await logEvent("info", "ad-referral-capture", "payload recebido", {
    temAnuncio: Object.keys(marcadores).length > 0,
    marcadores,
    tamanhoOriginal: raw.length,
    truncado: raw.length > LIMITE_CORPO,
    body: raw.slice(0, LIMITE_CORPO),
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "gines-atendimento capture (só grava, não processa)" });
}
