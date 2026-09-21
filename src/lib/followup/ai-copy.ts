import { createServiceClient } from "@/lib/supabase/service";
import { MODEL, openaiClient } from "@/lib/ai/openai";
import { logEvent } from "@/lib/log";
import { copyFallback } from "./messages";
import { greetingFor } from "./business-hours";

type Db = ReturnType<typeof createServiceClient>;

/**
 * Objetivo de cada toque da cadência (spec do cliente). A IA escreve o texto a partir do
 * histórico real; aqui só vai a intenção — assim nenhum toque repete o anterior palavra
 * por palavra e todos retomam o assunto de onde a conversa parou.
 */
export const OBJETIVO_TOQUE: Record<number, string> = {
  1: "Retomar o assunto exatamente de onde a conversa parou (cite o último ponto tratado), de forma leve, e convidar a pessoa a continuar.",
  2: "Tentativa leve de contato: uma frase curta e simpática perguntando se a pessoa conseguiu ver a última mensagem ou se ainda tem interesse.",
  3: "Escassez natural: mostrar que o imóvel tem procura e que vale não deixar pra depois (ex.: \"Temos visitas agendadas para este fim de semana...\"), convidando pra agendar uma visita. Sem pressão agressiva e sem inventar números.",
  4: "Investigação: perguntar com curiosidade genuína se o imóvel não encaixou no perfil (ex.: \"A casa não encaixou no seu perfil?\") e se oferecer pra buscar algo mais adequado.",
  5: "Penúltima tentativa de resgate: tom cordial, reforçar que está à disposição e fazer uma pergunta simples que seja fácil de responder.",
  6: "Ultimato educado: avisar que, como não houve retorno, está encerrando o atendimento (ex.: \"Como não tive retorno, estou encerrando seu atendimento...\"), deixando a porta aberta pra pessoa chamar quando quiser.",
};

const HISTORICO_LIMITE = 20;

/**
 * Gera o texto do toque com a IA. Nunca lança: se a geração falhar ou vier vazia, cai no
 * modelo fixo de ./messages — o toque sai de qualquer jeito.
 */
export async function gerarTextoToque(params: {
  db: Db;
  conversationId: string;
  touch: number;
  nome: string | null;
  propertyId: string | null;
  now: Date;
}): Promise<{ texto: string; origem: "ia" | "fallback" }> {
  const { db, conversationId, touch, nome, propertyId, now } = params;
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
      `Objetivo desta mensagem (toque ${touch} de 6): ${OBJETIVO_TOQUE[touch] ?? OBJETIVO_TOQUE[6]}`,
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
      touch,
      error: err instanceof Error ? err.message : String(err),
    });
    return { texto: copyFallback(touch, nome), origem: "fallback" };
  }
}
