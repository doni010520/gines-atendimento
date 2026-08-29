import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { executeTool, type ToolContext } from "@/lib/ai/tools-exec";
import {
  buildCopyVars,
  dispararEstagioAgora,
  renderStage,
  scheduleStage,
  PROPERTY_COPY_COLUMNS,
  type PropertyForCopy,
} from "@/lib/followup/engine";
import { copyOptOut, MENSAGEM_HANDOFF } from "@/lib/followup/messages";
import { parseUazapiMessage } from "@/lib/whatsapp/parse-webhook";
import { casarImovelPorAnuncio } from "@/lib/whatsapp/match-property";
import { SHIFT_LABEL, type Shift } from "@/lib/followup/business-hours";

export const dynamic = "force-dynamic";

/**
 * Endpoints de depuração (padrão do LidIA — muito útil pra QA sem depender do WhatsApp real).
 * Trancado atrás de DEBUG=true + token. Em produção normal, DEBUG=false => tudo 404.
 *
 *   GET /api/debug?token=...&action=recent-messages&conversationId=...
 *   GET /api/debug?token=...&action=logs&limit=50
 *   GET /api/debug?token=...&action=regua-preview[&propertyId=...&nome=Ricardo]
 *   POST /api/debug?token=...&action=test-tool  body: { conversationId, name, args }
 *   POST /api/debug?token=...&action=regua-disparar&confirmar=1  body: { conversationId }
 *   POST /api/debug?token=...&action=ad-match  body: <payload cru da uazapi>
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

  /**
   * Mostra as 3 mensagens da régua exatamente como o cliente receberia, com os dados reais
   * do imóvel, e quando cada uma sairia se o material fosse enviado agora. NÃO envia nada.
   * Sem propertyId, lista os imóveis ativos pra escolher.
   */
  if (action === "regua-preview") {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const nome = req.nextUrl.searchParams.get("nome");

    if (!propertyId) {
      const { data, error } = await db
        .from("properties")
        .select("id,title,kind,neighborhood,status")
        .eq("status", "ativo")
        .order("created_at", { ascending: false });
      return NextResponse.json({
        ok: !error,
        aviso: "escolha um e repita com &propertyId=<id>",
        imoveis: data,
        error: error?.message,
      });
    }

    const { data: property, error } = await db
      .from("properties")
      .select(PROPERTY_COPY_COLUMNS)
      .eq("id", propertyId)
      .maybeSingle();
    if (error || !property) {
      return NextResponse.json({ ok: false, error: error?.message ?? "imóvel não encontrado" }, { status: 404 });
    }

    const now = new Date();
    const vars = await buildCopyVars(db, property as PropertyForCopy, nome, now);

    // encadeia os 3 estágios como o motor faria, respeitando a alternância de turnos
    const agenda: Array<{ at: Date; shift: Shift } | null> = [];
    let lastShift: Shift | null = null;
    for (const stage of [1, 2, 3]) {
      const slot = scheduleStage(stage, now, lastShift, now);
      agenda.push(slot);
      lastShift = slot?.shift ?? lastShift;
    }

    const quando = (slot: { at: Date; shift: Shift } | null) =>
      slot
        ? `${new Intl.DateTimeFormat("pt-BR", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "America/Sao_Paulo",
          }).format(slot.at)} (${SHIFT_LABEL[slot.shift]})`
        : "—";

    return NextResponse.json({
      ok: true,
      imovel: { id: property.id, titulo: property.title, tipo: vars.tipo, local: vars.local },
      destaques_extraidos: {
        visual: vars.destaqueVisual || "(nenhum sustentado pela base — a frase sai da copy)",
        tecnico: vars.destaqueTecnico || "(nenhum sustentado pela base — a frase sai da copy)",
        base_afirma_reforma: vars.reformado,
      },
      simulacao: "considerando que o material fosse enviado agora",
      regua: [
        { etapa: "D1", quando: quando(agenda[0]), mensagem: renderStage(1, vars) },
        { etapa: "D3", quando: quando(agenda[1]), mensagem: renderStage(2, vars) },
        { etapa: "D7", quando: quando(agenda[2]), mensagem: renderStage(3, vars) },
      ],
      frases_fixas: {
        opt_out: copyOptOut(nome),
        handoff: MENSAGEM_HANDOFF,
      },
    });
  }

  return NextResponse.json({ ok: false, error: "action desconhecida" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 404 });
  const action = req.nextUrl.searchParams.get("action");

  /**
   * Dispara o estágio atual da régua AGORA, ignorando a janela de horário. Serve pra ver
   * D1/D3/D7 no mesmo dia em vez de esperar uma semana. Manda WhatsApp DE VERDADE e avança
   * o estado igual ao cron — por isso exige confirmar=1 além do token.
   */
  if (action === "regua-disparar") {
    if (req.nextUrl.searchParams.get("confirmar") !== "1") {
      return NextResponse.json(
        { ok: false, error: "isso envia WhatsApp de verdade — repita com &confirmar=1" },
        { status: 400 }
      );
    }
    const body = await req.json().catch(() => ({}));
    const { conversationId } = body as { conversationId?: string };
    if (!conversationId) return NextResponse.json({ ok: false, error: "conversationId é obrigatório" }, { status: 400 });

    const db = createServiceClient();
    const resultado = await dispararEstagioAgora(db, conversationId);
    return NextResponse.json({ ok: resultado.enviado, ...resultado });
  }

  /**
   * Passa um payload cru pelo parser e pelo casamento anúncio->imóvel, sem criar contato,
   * conversa nem mandar mensagem. Serve pra conferir um anúncio novo antes de confiar nele.
   * Efeito colateral proposital: se casar por título, o id do anúncio fica aprendido.
   */
  if (action === "ad-match") {
    const bruto = await req.json().catch(() => null);
    if (!bruto) return NextResponse.json({ ok: false, error: "mande o payload cru no corpo" }, { status: 400 });

    const mensagem = (bruto as Record<string, unknown>).message ?? bruto;
    const parsed = parseUazapiMessage(mensagem as Record<string, unknown>);
    if (!parsed.adReferral) {
      return NextResponse.json({ ok: true, temAnuncio: false, aviso: "nenhum dado de anúncio nesse payload" });
    }

    const db = createServiceClient();
    const propertyId = await casarImovelPorAnuncio(db, parsed.adReferral);
    const { data: imovel } = propertyId
      ? await db.from("properties").select("id,title,ad_source_ids").eq("id", propertyId).maybeSingle()
      : { data: null };

    return NextResponse.json({
      ok: true,
      temAnuncio: true,
      de: parsed.phone,
      texto: parsed.text,
      referral: parsed.adReferral,
      imovel_identificado: imovel ?? "(nenhum — o bot perguntaria normalmente)",
    });
  }

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
    visitOffersCount: conversation.visit_offers_count,
  };

  // CUIDADO: enviar_material manda mensagem de WhatsApp de verdade se o número for real.
  const result = await executeTool(name, args ?? {}, ctx);
  return NextResponse.json({ ok: true, result });
}
