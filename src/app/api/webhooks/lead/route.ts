import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAgentTurn } from "@/lib/ai/agent";
import { casarImovelPorAnuncio } from "@/lib/whatsapp/match-property";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Entrada de leads da planilha do Gines (Google Sheets → Apps Script → aqui).
 *
 * POST /api/webhooks/lead?token=LEAD_WEBHOOK_TOKEN
 * body: { nome, telefone, anuncio?, linha? }
 *
 * Cria contato + conversa e a IA faz a PRIMEIRA abordagem na hora (a pessoa ainda não mandou
 * mensagem no WhatsApp). Número que já existe no sistema é ignorado — nunca chama duas vezes,
 * nem atropela conversa que o Gines já esteja tocando.
 */

/** Só dígitos, com DDI 55 quando vier só DDD+número. */
function normalizarTelefone(bruto: string): string | null {
  let d = bruto.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-lead-token");
  if (!process.env.LEAD_WEBHOOK_TOKEN || token !== process.env.LEAD_WEBHOOK_TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(body.nome ?? "").trim() || null;
  const anuncio = String(body.anuncio ?? "").trim() || null;
  const telefone = normalizarTelefone(String(body.telefone ?? ""));
  if (!telefone) {
    return NextResponse.json({ ok: false, resultado: "telefone_invalido" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: existente } = await db.from("contacts").select("id").eq("phone", telefone).maybeSingle();
  if (existente) {
    return NextResponse.json({ ok: true, resultado: "ja_existia" });
  }

  // nome veio do formulário, digitado pela própria pessoa: vale como confirmado
  const { data: contato, error: errContato } = await db
    .from("contacts")
    .insert({ phone: telefone, name: nome, name_confirmed: Boolean(nome) })
    .select("id")
    .single();
  if (errContato || !contato) {
    // corrida: a outra chamada da mesma linha criou antes
    return NextResponse.json({ ok: true, resultado: "ja_existia" });
  }

  const propertyId = anuncio ? await casarImovelPorAnuncio(db, { title: anuncio }).catch(() => null) : null;

  const { data: conversa, error: errConversa } = await db
    .from("conversations")
    .insert({ contact_id: contato.id, property_id: propertyId })
    .select("id")
    .single();
  if (errConversa || !conversa) {
    await logEvent("error", "lead-planilha", "falha ao criar conversa do lead", { telefone, error: errConversa?.message });
    return NextResponse.json({ ok: false, resultado: "erro" }, { status: 500 });
  }

  await db.from("messages").insert({
    conversation_id: conversa.id,
    direction: "in",
    is_internal: true,
    body: `[lead da planilha] nome=${nome ?? "?"} anúncio=${anuncio ?? "?"} linha=${String(body.linha ?? "?")}`,
  });
  await logEvent("info", "lead-planilha", "lead recebido da planilha", {
    conversationId: conversa.id,
    imovelIdentificado: Boolean(propertyId),
  });

  // responde já pra planilha não esperar a IA; o turno roda em seguida no servidor
  void runAgentTurn(conversa.id, {
    instrucaoExtra: [
      "PRIMEIRA ABORDAGEM: esta pessoa preencheu o formulário de um anúncio e ainda NÃO mandou mensagem no WhatsApp — é você quem inicia a conversa agora.",
      nome ? `O nome dela (do formulário) é ${nome}: não pergunte o nome.` : "",
      "Cumprimente, diga que está entrando em contato porque ela demonstrou interesse pelo anúncio e siga o FLUXO a partir do passo do imóvel.",
      "Nesta primeira mensagem NÃO chame transferir_para_humano: a pessoa ainda não pediu nada. Se algo falhar, só pergunte em qual imóvel ela tem interesse.",
    ]
      .filter(Boolean)
      .join(" "),
  }).catch((err) =>
    logEvent("error", "lead-planilha", "falha na primeira abordagem da IA", {
      conversationId: conversa.id,
      error: err instanceof Error ? err.message : String(err),
    })
  );

  return NextResponse.json({ ok: true, resultado: "chamado", imovelIdentificado: Boolean(propertyId) });
}
