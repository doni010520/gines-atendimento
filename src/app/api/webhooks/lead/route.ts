import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAgentTurn } from "@/lib/ai/agent";
import { casarImovelPorAnuncio } from "@/lib/whatsapp/match-property";
import { logEvent } from "@/lib/log";
import { sendText } from "@/lib/whatsapp/uazapi";
import { greetingFor } from "@/lib/followup/business-hours";

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

  // responde já pra planilha não esperar; a abordagem roda em seguida no servidor
  void primeiraAbordagem(db, conversa.id, telefone, nome, propertyId).catch((err) =>
    logEvent("error", "lead-planilha", "falha na primeira abordagem", {
      conversationId: conversa.id,
      error: err instanceof Error ? err.message : String(err),
    })
  );

  return NextResponse.json({ ok: true, resultado: "chamado", imovelIdentificado: Boolean(propertyId) });
}

/**
 * Ordem pedida pelo Gines (01/10): saudação → material → convite pra visita.
 * A IA só manda texto no fim do turno (depois das tools), então com imóvel identificado a
 * saudação sai daqui, fixa, ANTES; a IA fica só com material + convite.
 */
async function primeiraAbordagem(
  db: ReturnType<typeof createServiceClient>,
  conversationId: string,
  telefone: string,
  nome: string | null,
  propertyId: string | null
) {
  const primeiroNome = nome?.trim().split(/\s+/)[0];
  const regras =
    "Nesta abordagem NÃO chame transferir_para_humano: a pessoa ainda não pediu nada. Se algo falhar, só pergunte em qual imóvel ela tem interesse.";

  if (!propertyId) {
    // sem imóvel não há material: a IA cumprimenta e pergunta qual imóvel, numa mensagem só
    await runAgentTurn(conversationId, {
      instrucaoExtra: [
        "PRIMEIRA ABORDAGEM: esta pessoa preencheu o formulário de um anúncio e ainda NÃO mandou mensagem no WhatsApp — é você quem inicia a conversa agora.",
        nome ? `O nome dela (do formulário) é ${nome}: não pergunte o nome.` : "",
        "Cumprimente, diga que está entrando em contato porque ela demonstrou interesse pelo anúncio e pergunte em qual imóvel tem interesse.",
        regras,
      ]
        .filter(Boolean)
        .join(" "),
    });
    return;
  }

  const { data: imovel } = await db.from("properties").select("title").eq("id", propertyId).maybeSingle();
  const saudacao =
    `${greetingFor(new Date())}${primeiroNome ? `, ${primeiroNome}` : ""}! Aqui é a assistente virtual do Gines. ` +
    `Vi que você se interessou pelo anúncio${imovel?.title ? ` da ${imovel.title}` : ""} e vou te enviar o material completo.`;
  await sendText(telefone, saudacao);
  await db.from("messages").insert({ conversation_id: conversationId, direction: "out", body: saudacao, is_internal: false });

  await runAgentTurn(conversationId, {
    instrucaoExtra: [
      "PRIMEIRA ABORDAGEM: você JÁ cumprimentou a pessoa na mensagem anterior — não cumprimente nem se apresente de novo.",
      nome ? `O nome dela é ${nome}: não pergunte o nome.` : "",
      "Agora chame enviar_material e, depois, termine com UMA mensagem curta convidando para conhecer o imóvel (chame oferecer_visita).",
      regras,
    ]
      .filter(Boolean)
      .join(" "),
  });
}
