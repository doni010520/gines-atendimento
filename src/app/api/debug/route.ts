import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { executeTool, type ToolContext } from "@/lib/ai/tools-exec";
import { dispararToqueAgora, scheduleTouch } from "@/lib/followup/engine";
import { gerarTextoToque } from "@/lib/followup/ai-copy";
import { carregarConfig, carregarToquesAtivos, rotuloDias } from "@/lib/followup/touches";
import { copyOptOut, MENSAGEM_HANDOFF } from "@/lib/followup/messages";
import { parseUazapiMessage } from "@/lib/whatsapp/parse-webhook";
import { casarImovelPorAnuncio } from "@/lib/whatsapp/match-property";

export const dynamic = "force-dynamic";

/**
 * Endpoints de depuração (padrão do LidIA — muito útil pra QA sem depender do WhatsApp real).
 * Trancado atrás de DEBUG=true + token. Em produção normal, DEBUG=false => tudo 404.
 *
 *   GET /api/debug?token=...&action=recent-messages&conversationId=...
 *   GET /api/debug?token=...&action=logs&limit=50
 *   GET /api/debug?token=...&action=regua-preview[&conversationId=...]
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
   * Mostra a agenda da cadência (toques ativos cadastrados em /cadencia) considerando que o robô falou agora, com o
   * objetivo e a mídia de cada toque. Com conversationId, gera também o texto que a IA
   * mandaria em cada toque a partir do histórico real (chama a OpenAI). NÃO envia nada.
   */
  if (action === "regua-preview") {
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    const now = new Date();

    const [ativos, config] = await Promise.all([carregarToquesAtivos(db), carregarConfig(db)]);

    const { data: conversa } = conversationId
      ? await db
          .from("conversations")
          .select("id,property_id,contact:contacts(name)")
          .eq("id", conversationId)
          .maybeSingle()
      : { data: null };

    const fmt = (d: Date | null) =>
      d
        ? new Intl.DateTimeFormat("pt-BR", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "America/Sao_Paulo",
          }).format(d)
        : "—";

    const toques = [];
    for (const [i, toque] of ativos.entries()) {
      const texto = conversa
        ? await gerarTextoToque({
            db,
            conversationId: conversa.id,
            toque,
            indice: i + 1,
            total: ativos.length,
            nome: conversa.contact?.name ?? null,
            propertyId: conversa.property_id,
            now,
          })
        : null;
      toques.push({
        toque: i + 1,
        id: toque.id,
        horas: Number(toque.delay_hours),
        dia: rotuloDias(toque.delay_hours),
        quando: fmt(scheduleTouch(toque, i + 1, now)),
        objetivo: toque.objective,
        midia: toque.media_url ? `${toque.media_kind}: ${toque.media_url}` : "(sem mídia — só texto)",
        ...(texto ? { mensagem: texto.texto, origem: texto.origem } : {}),
      });
    }

    return NextResponse.json({
      ok: true,
      simulacao: "considerando que o robô mandou a última mensagem agora e o lead não respondeu",
      ...(conversationId && !conversa ? { aviso: "conversa não encontrada — mostrando só a agenda" } : {}),
      cadencia: toques,
      ao_encerrar: config.applyFinalTag ? `tag "${config.finalTag}"` : "(sem etiqueta — desligada no painel)",
      frases_fixas: {
        opt_out: copyOptOut(conversa?.contact?.name ?? null),
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
   * Dispara o próximo toque da cadência AGORA, ignorando a janela de horário. Serve pra ver
   * todos os toques no mesmo dia em vez de esperar 9 dias. Manda WhatsApp DE VERDADE e avança
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
    const resultado = await dispararToqueAgora(db, conversationId);
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
