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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // payload ilegível — ignora, responde 200
  }

  try {
    await routeWebhookBody(body);
  } catch (err) {
    await logEvent("error", "webhook", "erro não tratado no webhook", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * A uazapi não segue um envelope único e estável entre eventos (documentação real diverge
 * da observada em produção — "event" às vezes é string discriminadora, às vezes é o próprio
 * payload do evento). Em vez de apostar num formato, tenta várias formas conhecidas em ordem
 * e, se nada bater, loga o corpo cru inteiro pra dar pra ajustar rápido sem perder o evento.
 */
async function routeWebhookBody(body: Record<string, unknown>) {
  // forma REAL confirmada em produção (13/08/26): discriminador é "EventType" (não "event"),
  // e a mensagem vem em "message" (objeto único, não lista, não "data").
  const eventType = body.EventType;
  if (typeof body.message === "object" && body.message && looksLikeMessage(body.message as Record<string, unknown>)) {
    if (eventType && eventType !== "messages" && eventType !== "message") {
      await logEvent("info", "webhook", "EventType inesperado com message presente", { eventType });
    }
    return processInboundMessages([body.message as Record<string, unknown>]);
  }

  const eventField = body.event;

  // forma documentada: { event: "messages" | "message", data: {...} }
  if (eventField === "message" || eventField === "messages") {
    return processInboundMessages(extractMessages(body.data));
  }
  if (eventField === "status" || eventField === "messages_update") {
    return processStatusUpdates(extractMessages(body.data));
  }
  if (eventField === "connection" || eventField === "presence") {
    return; // sem ação — evento reconhecido, só não precisamos fazer nada com ele
  }

  // forma observada: "event" é o próprio objeto do payload (recibo/atualização), com um
  // campo "Type" indicando o que é (ex: "Delivered", "Read").
  if (eventField && typeof eventField === "object") {
    const inner = eventField as Record<string, unknown>;
    const type = typeof inner.Type === "string" ? inner.Type.toLowerCase() : undefined;
    const messageIds = Array.isArray(inner.MessageIDs) ? inner.MessageIDs : undefined;
    if (type && messageIds) {
      return processStatusUpdates(messageIds.map((id) => ({ messageid: String(id), status: type })));
    }
    // "event" objeto mas sem o formato de recibo conhecido — pode ser uma mensagem de verdade
    if (looksLikeMessage(inner)) {
      return processInboundMessages([inner]);
    }
  }

  // fallback: o body inteiro (ou body.data) já é/contém a mensagem, sem wrapper "event" nenhum
  if (looksLikeMessage(body)) {
    return processInboundMessages([body]);
  }
  const fromData = extractMessages(body.data);
  if (fromData.length) return processInboundMessages(fromData);

  await logEvent("info", "webhook", "formato de payload não reconhecido", {
    body: JSON.stringify(body).slice(0, 4000),
  });
}

function looksLikeMessage(obj: Record<string, unknown>): boolean {
  const hasChat = typeof obj.chatid === "string" || typeof obj.Chat === "string";
  const hasContent = obj.text !== undefined || obj.content !== undefined || typeof obj.messageid === "string";
  return hasChat && hasContent;
}

async function processInboundMessages(messages: Record<string, unknown>[]) {
  for (const message of messages) {
    await handleInboundMessage(message).catch((err) =>
      logEvent("error", "webhook", "falha ao processar mensagem", {
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function processStatusUpdates(items: Record<string, unknown>[]) {
  for (const item of items) {
    await applyStatus(item).catch((err) =>
      logEvent("error", "webhook", "falha ao processar status", {
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function applyStatus(d: Record<string, unknown>) {
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
