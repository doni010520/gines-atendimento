import { createServiceClient } from "@/lib/supabase/service";
import { sendText, sendMedia } from "@/lib/whatsapp/uazapi";
import { logEvent } from "@/lib/log";

type Db = ReturnType<typeof createServiceClient>;

export type ToolContext = {
  db: Db;
  conversationId: string;
  phone: string;
  contactId: string;
  propertyId: string | null;
  materialSentAt: string | null;
  visitOffered: boolean;
};

const HANDOFF_RENOTIFY_MS = 10 * 60 * 1000;
const FOLLOWUP_STAGE1_MS = 2 * 60 * 60 * 1000; // +2h: avaliou? quer visitar?

async function toolBuscarImovel(db: Db, args: Record<string, unknown>) {
  let q = db
    .from("properties")
    .select("id,title,type,kind,kind_synonyms,price,city,neighborhood,bedrooms,status", { count: "exact" })
    .eq("status", "ativo");
  if (typeof args.cidade === "string" && args.cidade.trim()) q = q.ilike("city", `%${args.cidade.trim()}%`);
  if (typeof args.bairro === "string" && args.bairro.trim()) q = q.ilike("neighborhood", `%${args.bairro.trim()}%`);
  if (typeof args.tipo_imovel === "string" && args.tipo_imovel.trim()) {
    // "tipo" tem vocabulário variado (studio/kitnet/apê = apartamento) — bate no kind OU
    // nos sinônimos cadastrados, nunca só no valor exato (achado real: "studio" não batia
    // com kind="apartamento" e o bot dizia "não temos" pra um imóvel que existia)
    const termo = args.tipo_imovel.trim().toLowerCase().replace(/[,{}]/g, "");
    q = q.or(`kind.ilike.%${termo}%,kind_synonyms.cs.{${termo}}`);
  }
  if (args.tipo === "venda" || args.tipo === "locacao") q = q.eq("type", args.tipo);
  if (typeof args.preco_max === "number") q = q.lte("price", args.preco_max);
  if (typeof args.preco_min === "number") q = q.gte("price", args.preco_min);
  if (typeof args.quartos_min === "number") q = q.gte("bedrooms", args.quartos_min);

  const { data, error, count } = await q.limit(8);
  if (error) return { ok: false, error: "falha na busca" };
  const total = count ?? data?.length ?? 0;
  // preço NUNCA vem nessa listagem — força o modelo a não citar preço solto ao apresentar
  // várias opções (achado real: bot listava com preço mesmo sendo instruído a não fazer isso
  // só no prompt). Preço só aparece via focar_imovel + enviar_material, já com todo o contexto.
  const imoveis = (data ?? []).map(({ price: _price, ...rest }) => rest);
  return {
    ok: true,
    imoveis,
    total_encontrado: total,
    aviso_preco: "Preço PROPOSITALMENTE não veio nesses resultados — não invente nem estime. Só mencione preço depois de focar num imóvel e mandar o material completo dele.",
    // aviso explícito pro modelo não inventar "mais opções" quando já mostrou tudo que existe
    aviso: total <= (data?.length ?? 0) ? "esta lista é TUDO que bateu com o filtro, não existe mais nada além disso pra oferecer" : `mostrando ${data?.length} de ${total} — há mais resultados, pode refinar o filtro se a pessoa quiser`,
  };
}

async function toolFocarImovel(ctx: ToolContext, args: Record<string, unknown>) {
  const propertyId = typeof args.property_id === "string" ? args.property_id : null;
  if (!propertyId) return { ok: false, error: "property_id ausente" };

  const { data: property } = await ctx.db.from("properties").select("id").eq("id", propertyId).maybeSingle();
  if (!property) return { ok: false, error: "imóvel não encontrado" };

  await ctx.db.from("conversations").update({ property_id: propertyId }).eq("id", ctx.conversationId);
  return { ok: true };
}

/**
 * Manda o bloco inteiro (copy + vídeo + PDF) numa chamada só — não depende do modelo
 * lembrar de chamar a tool 3 vezes. Achado real (19/08/26): o modelo mandava só a copy
 * e afirmava "já te enviei todos os detalhes", pulando vídeo/PDF de verdade.
 */
async function toolEnviarMaterial(ctx: ToolContext) {
  if (!ctx.propertyId) return { ok: false, error: "nenhum imóvel em foco ainda — chame focar_imovel primeiro" };

  const { data: property } = await ctx.db
    .from("properties")
    .select("title,copy,video_url,pdf_url")
    .eq("id", ctx.propertyId)
    .maybeSingle();
  if (!property) return { ok: false, error: "imóvel não encontrado" };

  const resultado = { enviado_copy: false, enviado_video: false, enviado_pdf: false, motivo_video: "", motivo_pdf: "" };

  try {
    await sendText(ctx.phone, property.copy);
    resultado.enviado_copy = true;
    await ctx.db.from("messages").insert({
      conversation_id: ctx.conversationId,
      direction: "out",
      body: property.copy,
      is_internal: false,
    });
  } catch (err) {
    await logEvent("error", "enviar_material", "falha ao enviar copy", {
      conversationId: ctx.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!property.video_url) {
    resultado.motivo_video = "sem vídeo cadastrado pra esse imóvel";
  } else {
    try {
      await sendMedia({ number: ctx.phone, type: "video", file: property.video_url, text: property.title });
      resultado.enviado_video = true;
      await ctx.db.from("messages").insert({
        conversation_id: ctx.conversationId,
        direction: "out",
        body: "[vídeo do imóvel enviado]",
        is_internal: false,
      });
    } catch (err) {
      resultado.motivo_video = "falha técnica ao enviar";
      await logEvent("error", "enviar_material", "falha ao enviar vídeo", {
        conversationId: ctx.conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!property.pdf_url) {
    resultado.motivo_pdf = "sem PDF cadastrado pra esse imóvel";
  } else {
    try {
      await sendMedia({ number: ctx.phone, type: "document", file: property.pdf_url, docName: `${property.title}.pdf` });
      resultado.enviado_pdf = true;
      await ctx.db.from("messages").insert({
        conversation_id: ctx.conversationId,
        direction: "out",
        body: "[PDF do imóvel enviado]",
        is_internal: false,
      });
    } catch (err) {
      resultado.motivo_pdf = "falha técnica ao enviar";
      await logEvent("error", "enviar_material", "falha ao enviar PDF", {
        conversationId: ctx.conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!ctx.materialSentAt && (resultado.enviado_copy || resultado.enviado_video || resultado.enviado_pdf)) {
    const nextFollowup = new Date(Date.now() + FOLLOWUP_STAGE1_MS).toISOString();
    await ctx.db
      .from("conversations")
      .update({ material_sent_at: new Date().toISOString(), followup_stage: 1, next_followup_at: nextFollowup })
      .eq("id", ctx.conversationId);
  }

  return { ok: true, ...resultado };
}

async function toolOferecerVisita(ctx: ToolContext) {
  if (ctx.visitOffered) {
    return { ok: true, ja_oferecido: true, aviso: "já foi oferecido antes nesta conversa — não repita o convite" };
  }
  await ctx.db.from("conversations").update({ visit_offered: true }).eq("id", ctx.conversationId);
  return { ok: true, ja_oferecido: false };
}

async function toolRegistrarNome(ctx: ToolContext, args: Record<string, unknown>) {
  const nome = typeof args.nome === "string" ? args.nome.trim() : "";
  if (!nome) return { ok: false, error: "nome vazio" };
  await ctx.db.from("contacts").update({ name: nome, name_confirmed: true }).eq("id", ctx.contactId);
  return { ok: true };
}

const MOTIVO_LABEL: Record<string, string> = {
  visita: "Quer marcar visita",
  duvida_nao_respondida: "Dúvida que a IA não soube responder",
  pedido_explicito: "Pediu pra falar com alguém",
  outro: "Outro motivo",
};

async function toolTransferirParaHumano(ctx: ToolContext, args: Record<string, unknown>) {
  const motivo = typeof args.motivo === "string" ? args.motivo : "outro";
  const resumo = typeof args.resumo === "string" ? args.resumo : "";

  const { data: conversation } = await ctx.db
    .from("conversations")
    .select("handoff_notified_at,status")
    .eq("id", ctx.conversationId)
    .single();

  await ctx.db
    .from("conversations")
    .update({ status: "queued", next_followup_at: null })
    .eq("id", ctx.conversationId);

  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    direction: "out",
    body: `[transferência solicitada] motivo=${motivo}: ${resumo}`,
    is_internal: true,
  });

  const lastNotified = conversation?.handoff_notified_at ? new Date(conversation.handoff_notified_at).getTime() : 0;
  const shouldNotify = Date.now() - lastNotified > HANDOFF_RENOTIFY_MS;

  if (shouldNotify) {
    const groupId = process.env.NOTIFY_GROUP_ID;
    if (groupId) {
      const { data: contact } = await ctx.db.from("contacts").select("phone,name").eq("id", ctx.contactId).single();
      const { data: property } = ctx.propertyId
        ? await ctx.db.from("properties").select("title,address,neighborhood,city").eq("id", ctx.propertyId).maybeSingle()
        : { data: null };

      const linhas = [
        `📥 *${MOTIVO_LABEL[motivo] ?? motivo}*`,
        `Cliente: ${contact?.name ?? "sem nome"} — ${contact?.phone}`,
        property
          ? `Imóvel: ${property.title} — ${[property.address, property.neighborhood, property.city].filter(Boolean).join(", ")}`
          : `Imóvel: não identificado ainda`,
        resumo ? `Contexto: ${resumo}` : "",
        ``,
        `Assuma pelo painel.`,
      ].filter(Boolean);

      await sendText(groupId, linhas.join("\n")).catch((err) =>
        logEvent("error", "handoff", "falha ao notificar grupo", { error: err instanceof Error ? err.message : String(err) })
      );
    } else {
      await logEvent("warn", "handoff", "NOTIFY_GROUP_ID não configurado — ninguém foi avisado da transferência", {
        conversationId: ctx.conversationId,
      });
    }
    await ctx.db
      .from("conversations")
      .update({ handoff_notified_at: new Date().toISOString() })
      .eq("id", ctx.conversationId);
  }

  return { ok: true };
}

async function toolFinalizarAtendimento(ctx: ToolContext, args: Record<string, unknown>) {
  const motivo = typeof args.motivo === "string" ? args.motivo : "nao_interessado";
  await ctx.db
    .from("conversations")
    .update({ status: "closed", next_followup_at: null, closed_at: new Date().toISOString() })
    .eq("id", ctx.conversationId);
  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    direction: "out",
    body: `[atendimento encerrado] motivo=${motivo}`,
    is_internal: true,
  });
  return { ok: true };
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  switch (name) {
    case "buscar_imovel":
      return toolBuscarImovel(ctx.db, args);
    case "focar_imovel":
      return toolFocarImovel(ctx, args);
    case "enviar_material":
      return toolEnviarMaterial(ctx);
    case "oferecer_visita":
      return toolOferecerVisita(ctx);
    case "registrar_nome":
      return toolRegistrarNome(ctx, args);
    case "transferir_para_humano":
      return toolTransferirParaHumano(ctx, args);
    case "finalizar_atendimento":
      return toolFinalizarAtendimento(ctx, args);
    default:
      return { ok: false, error: `tool desconhecida: ${name}` };
  }
}
