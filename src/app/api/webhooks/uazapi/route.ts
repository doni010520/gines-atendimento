import { NextRequest, NextResponse } from "next/server";
import { handleInboundMessage } from "@/lib/whatsapp/inbound";
import { extractMessages } from "@/lib/whatsapp/parse-webhook";
import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest) {
  const expected = process.env.WEBHOOK_TOKEN;
  if (!expected) return false;
  const fromQuery = req.nextUrl.searchParams.get("token");
  const fromHeader = req.headers.get("x-webhook-token");
  return fromQuery === expected || fromHeader === expected;
}

/**
 * Único webhook desta instância uazapi. SEMPRE responde 200 — mesmo em erro interno —
 * pra uazapi não ficar reentregando em loop. Toda falha vira log, nunca um 5xx aqui.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { event?: string; instance?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // payload ilegível — ignora, responde 200
  }

  try {
    if (body.event === "message") {
      const messages = extractMessages(body.data);
      for (const message of messages) {
        await handleInboundMessage(message).catch((err) =>
          logEvent("error", "webhook", "falha ao processar mensagem", {
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    } else if (body.event === "status") {
      await handleStatusUpdate(body.data).catch((err) =>
        logEvent("error", "webhook", "falha ao processar status", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  } catch (err) {
    await logEvent("error", "webhook", "erro não tratado no webhook", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true });
}

async function handleStatusUpdate(data: unknown) {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;
  const messageId = typeof d.messageid === "string" ? d.messageid : undefined;
  const status = typeof d.status === "string" ? d.status.toLowerCase() : undefined;
  if (!messageId || !status) return;

  // rank crescente — nunca deixa um status "regredir" (ex: delivered depois de read)
  const rank: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };
  if (!(status in rank)) return;

  const db = createServiceClient();
  const { data: existing } = await db.from("messages").select("id,status").eq("external_id", messageId).maybeSingle();
  if (!existing) return;
  if ((rank[existing.status] ?? -1) >= rank[status] && status !== "failed") return;

  await db.from("messages").update({ status: status as "sent" | "delivered" | "read" | "failed" }).eq("id", existing.id);
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "gines-atendimento webhook" });
}
