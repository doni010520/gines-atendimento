import { NextRequest, NextResponse } from "next/server";
import { runFollowupEngine } from "@/lib/followup/engine";
import { modoTesteGapMs } from "@/lib/followup/business-hours";

export const dynamic = "force-dynamic";

/**
 * Disparo manual da régua. O agendamento automático vive em src/instrumentation.ts, dentro
 * do próprio servidor — este endpoint continua aqui pra forçar uma rodada na mão (e pra um
 * cron externo, se um dia fizer sentido ter os dois).
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runFollowupEngine();
  const gapTeste = modoTesteGapMs();
  return NextResponse.json({
    ok: true,
    ...result,
    ...(gapTeste !== null ? { modo_teste: `estágios a cada ${gapTeste / 60_000} min, janela ignorada` } : {}),
  });
}
