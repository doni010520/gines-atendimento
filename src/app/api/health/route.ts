import { NextResponse } from "next/server";

/**
 * Checagem de publicação: diz desde quando este processo está no ar e se o agendador da
 * régua foi armado. Sem dado sensível — serve pra confirmar que um deploy trocou o container.
 */
const INICIADO_EM = new Date().toISOString();
const VERSAO = "2026-09-29.janela-followup";

export function GET() {
  const agendador = (globalThis as { __ginesScheduler?: string }).__ginesScheduler ?? "nao-armado";
  return NextResponse.json(
    { ok: true, versao: VERSAO, processoIniciadoEm: INICIADO_EM, uptimeSeg: Math.round(process.uptime()), agendador },
    { headers: { "cache-control": "no-store" } }
  );
}
