import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { executeTool, type ToolContext } from "@/lib/ai/tools-exec";

export const dynamic = "force-dynamic";

/**
 * Endpoints de depuração (padrão do LidIA — muito útil pra QA sem depender do WhatsApp real).
 * Trancado atrás de DEBUG=true + token. Em produção normal, DEBUG=false => tudo 404.
 *
 *   GET /api/debug?token=...&action=recent-messages&conversationId=...
 *   GET /api/debug?token=...&action=logs&limit=50
 *   POST /api/debug?token=...&action=test-tool  body: { conversationId, name, args }
 */
function isAuthorized(req: NextRequest) {
  if (process.env.DEBUG !== "true") return false;
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-debug-token");
  return Boolean(process.env.DEBUG_TOKEN) && token === process.env.DEBUG_TOKEN;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 404 });
  const db = createServiceClient();
  const action = req.nextUrl.searchParams.get("action");

  if (action === "recent-messages") {
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    let q = db.from("messages").select("*").order("created_at", { ascending: false }).limit(50);
    if (conversationId) q = q.eq("conversation_id", conversationId);
    const { data, error } = await q;
    return NextResponse.json({ ok: !error, data, error: error?.message });
  }

  if (action === "logs") {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
    const { data, error } = await db.from("app_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    return NextResponse.json({ ok: !error, data, error: error?.message });
  }

  if (action === "ad-referrals") {
    const { data, error } = await db.from("ad_referrals").select("*").order("created_at", { ascending: false }).limit(20);
    return NextResponse.json({ ok: !error, data, error: error?.message });
  }

  return NextResponse.json({ ok: false, error: "action desconhecida" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 404 });
  const action = req.nextUrl.searchParams.get("action");
  if (action !== "test-tool") return NextResponse.json({ ok: false, error: "action desconhecida" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { conversationId, name, args } = body as { conversationId?: string; name?: string; args?: Record<string, unknown> };
  if (!conversationId || !name) {
    return NextResponse.json({ ok: false, error: "conversationId e name são obrigatórios" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: conversation } = await db.from("conversations").select("*").eq("id", conversationId).single();
  if (!conversation) return NextResponse.json({ ok: false, error: "conversa não encontrada" }, { status: 404 });
  const { data: contact } = await db.from("contacts").select("*").eq("id", conversation.contact_id).single();
  if (!contact) return NextResponse.json({ ok: false, error: "contato não encontrado" }, { status: 404 });

  const ctx: ToolContext = {
    db,
    conversationId,
    phone: contact.phone,
    contactId: contact.id,
    propertyId: conversation.property_id,
    materialSentAt: conversation.material_sent_at,
    visitOffered: conversation.visit_offered,
  };

  // CUIDADO: enviar_material manda mensagem de WhatsApp de verdade se o número for real.
  const result = await executeTool(name, args ?? {}, ctx);
  return NextResponse.json({ ok: true, result });
}
