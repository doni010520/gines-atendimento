import { createServiceClient } from "@/lib/supabase/service";
import { MODEL, openaiClient } from "@/lib/ai/openai";
import { logEvent } from "@/lib/log";
import { copyFallback } from "./messages";
import { greetingFor } from "./business-hours";
import type { Toque } from "./touches";

type Db = ReturnType<typeof createServiceClient>;

/**
 * O objetivo de cada toque é cadastrado em /cadencia. A IA escreve o texto a partir do
 * histórico real; o painel só dá a intenção — assim nenhum toque repete o anterior palavra
 * por palavra e todos retomam o assunto de onde a conversa parou.
 */
const HISTORICO_LIMITE = 20;

/**
 * Gera o texto do toque com a IA. Nunca lança: se a geração falhar ou vier vazia, cai no
 * modelo fixo de ./messages — o toque sai de qualquer jeito.
 */
export async function gerarTextoToque(params: {
  db: Db;
  conversationId: string;
  /** Toque a escrever: objetivo (instrução pra IA) e texto de reserva vêm do painel. */
  toque: Pick<Toque, "objective" | "fallback_text">;
  /** Posição do toque na cadência ativa ("toque X de N"), só pra dar contexto à IA. */
  indice: number;
  total: number;
  nome: string | null;
  propertyId: string | null;
  now: Date;
}): Promise<{ texto: string; origem: "ia" | "fallback" }> {
  const { db, conversationId, toque, indice, total, nome, propertyId, now } = params;
  try {
    const { data: historico } = await db
      .from("messages")
      .select("direction,body,is_internal")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORICO_LIMITE);

    const { data: imovel } = propertyId
      ? await db
          .from("properties")
          .select("title,kind,neighborhood,city,price,copy,features,highlight_visual,highlight_tecnico")
          .eq("id", propertyId)
          .maybeSingle()
      : { data: null };

    const conversa = (historico ?? [])
      .reverse()
      .filter((m) => !m.is_internal && m.body)
      .map((m) => `${m.direction === "in" ? "Cliente" : "Você"}: ${m.body}`)
      .join("\n");

    const contextoImovel = imovel
      ? [
          `Título: ${imovel.title}`,
          imovel.kind && `Tipo: ${imovel.kind}`,
          [imovel.neighborhood, imovel.city].filter(Boolean).length > 0 &&
            `Local: ${[imovel.neighborhood, imovel.city].filter(Boolean).join(", ")}`,
          imovel.price != null && `Preço: R$ ${imovel.price}`,
          imovel.features?.length && `Características: ${imovel.features.join(", ")}`,
          imovel.highlight_visual && `Destaque visual: ${imovel.highlight_visual}`,
          imovel.highlight_tecnico && `Diferencial técnico: ${imovel.highlight_tecnico}`,
          imovel.copy && `Descrição: ${imovel.copy.slice(0, 800)}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "(nenhum imóvel em foco — fale do atendimento/da busca de imóvel de forma geral)";

    const system = [
      "Você é o assistente de atendimento de uma imobiliária, conversando pelo WhatsApp em português do Brasil.",
      "O cliente parou de responder. Escreva UMA mensagem de follow-up.",
      `Objetivo desta mensagem (toque ${indice} de ${total}): ${toque.objective}`,
      "Regras:",
      "- Curta e natural, estilo WhatsApp: no máximo 2 ou 3 frases, sem parecer robô nem e-mail.",
      "- NÃO repita frases, aberturas ou perguntas que você já mandou no histórico.",
      "- Não invente características, preços, datas ou fatos que não estejam no contexto.",
      "- Use só o primeiro nome do cliente, se souber. No máximo um emoji, e só se couber.",
      `- Se for cumprimentar pelo horário, agora é "${greetingFor(now)}".`,
      "- Responda APENAS com o texto da mensagem, sem aspas e sem explicações.",
      "",
      `Nome do cliente: ${nome?.trim() || "(desconhecido)"}`,
      "",
      "Imóvel em foco:",
      contextoImovel,
    ].join("\n");

    const completion = await openaiClient().chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Histórico da conversa (mais antigo primeiro):\n${conversa || "(vazio)"}` },
      ],
    });

    const texto = completion.choices[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "").trim();
    if (texto) return { texto, origem: "ia" };
    throw new Error("resposta vazia do modelo");
  } catch (err) {
    await logEvent("warn", "followup", "falha ao gerar texto do toque com IA — usando modelo fixo", {
      conversationId,
      toque: indice,
      error: err instanceof Error ? err.message : String(err),
    });
    return { texto: copyFallback(toque.fallback_text, nome), origem: "fallback" };
  }
}
