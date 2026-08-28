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
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.CAPTURE_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  await logEvent("info", "ad-referral-capture", "payload recebido", { body: raw.slice(0, 8000) });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "gines-atendimento capture (só grava, não processa)" });
}
