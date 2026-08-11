import { NextRequest, NextResponse } from "next/server";
import { runFollowupEngine } from "@/lib/followup/engine";

export const dynamic = "force-dynamic";

/**
 * Disparado por um cron externo (ex: cron-job.org) a cada 5 minutos — mesmo padrão usado
 * no Corrêa/MVF. Não há agendador nativo rodando dentro do container.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runFollowupEngine();
  return NextResponse.json({ ok: true, ...result });
}
