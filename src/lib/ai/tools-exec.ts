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
};

const HANDOFF_RENOTIFY_MS = 10 * 60 * 1000;
const FOLLOWUP_STAGE1_MS = 2 * 60 * 60 * 1000; // +2h: avaliou? quer visitar?

async function toolBuscarImovel(db: Db, args: Record<string, unknown>) {
  let q = db.from("properties").select("id,title,type,price,neighborhood,bedrooms,status").eq("status", "ativo");
  if (typeof args.bairro === "string" && args.bairro.trim()) q = q.ilike("neighborhood", `%${args.bairro.trim()}%`);
  if (args.tipo === "venda" || args.tipo === "locacao") q = q.eq("type", args.tipo);
  if (typeof args.preco_max === "number") q = q.lte("price", args.preco_max);
  if (typeof args.preco_min === "number") q = q.gte("price", args.preco_min);
  if (typeof args.quartos_min === "number") q = q.gte("bedrooms", args.quartos_min);

  const { data, error } = await q.limit(8);
  if (error) return { ok: false, error: "falha na busca" };
  return { ok: true, imoveis: data };
}

async function toolFocarImovel(ctx: ToolContext, args: Record<string, unknown>) {
  const propertyId = typeof args.property_id === "string" ? args.property_id : null;
  if (!propertyId) return { ok: false, error: "property_id ausente" };

  const { data: property } = await ctx.db.from("properties").select("id").eq("id", propertyId).maybeSingle();
  if (!property) return { ok: false, error: "imóvel não encontrado" };

  await ctx.db.from("conversations").update({ property_id: propertyId }).eq("id", ctx.conversationId);
  return { ok: true };
}

async function toolEnviarMaterial(ctx: ToolContext, args: Record<string, unknown>) {
  const tipo = args.tipo;
  if (tipo !== "copy" && tipo !== "video" && tipo !== "pdf") return { ok: false, error: "tipo inválido" };
  if (!ctx.propertyId) return { ok: false, error: "nenhum imóvel em foco ainda — chame focar_imovel primeiro" };

  const { data: property } = await ctx.db
    .from("properties")
    .select("title,copy,video_url,pdf_url")
    .eq("id", ctx.propertyId)
    .maybeSingle();
  if (!property) return { ok: false, error: "imóvel não encontrado" };

  let enviado = false;
  let motivo: string | undefined;

  try {
    if (tipo === "copy") {
      await sendText(ctx.phone, property.copy);
      enviado = true;
    } else if (tipo === "video") {
      if (!property.video_url) {
        motivo = "sem vídeo cadastrado pra esse imóvel";
      } else {
        await sendMedia({ number: ctx.phone, type: "video", file: property.video_url, text: property.title });
        enviado = true;
      }
    } else if (tipo === "pdf") {
      if (!property.pdf_url) {
        motivo = "sem PDF cadastrado pra esse imóvel";
      } else {
        await sendMedia({
          number: ctx.phone,
          type: "document",
          file: property.pdf_url,
          docName: `${property.title}.pdf`,
        });
        enviado = true;
      }
    }
  } catch (err) {
    await logEvent("error", "enviar_material", "falha ao enviar mídia", {
      conversationId: ctx.conversationId,
      tipo,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, enviado: false, error: "falha técnica ao enviar" };
  }

  if (enviado) {
    await ctx.db.from("messages").insert({
      conversation_id: ctx.conversationId,
      direction: "out",
      body: tipo === "copy" ? property.copy : `[material enviado: ${tipo}]`,
      is_internal: false,
    });

    if (!ctx.materialSentAt) {
      const nextFollowup = new Date(Date.now() + FOLLOWUP_STAGE1_MS).toISOString();
      await ctx.db
        .from("conversations")
        .update({ material_sent_at: new Date().toISOString(), followup_stage: 1, next_followup_at: nextFollowup })
        .eq("id", ctx.conversationId);
    }
  }

  return { ok: true, enviado, motivo };
}

async function toolRegistrarNome(ctx: ToolContext, args: Record<string, unknown>) {
  const nome = typeof args.nome === "string" ? args.nome.trim() : "";
  if (!nome) return { ok: false, error: "nome vazio" };
  await ctx.db.from("contacts").update({ name: nome, name_confirmed: true }).eq("id", ctx.contactId);
  return { ok: true };
}

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
      await sendText(
        groupId,
        `📥 *Novo atendimento pra assumir*\nMotivo: ${motivo}\n${resumo}\nContato: ${contact?.name ?? "sem nome"} — ${contact?.phone}\n\nAssuma pelo painel.`
      ).catch((err) =>
        logEvent("error", "handoff", "falha ao notificar grupo", { error: err instanceof Error ? err.message : String(err) })
      );
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
      return toolEnviarMaterial(ctx, args);
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
