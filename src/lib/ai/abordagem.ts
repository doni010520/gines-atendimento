import { createServiceClient } from "@/lib/supabase/service";
import { runAgentTurn } from "./agent";
import { sendText } from "@/lib/whatsapp/uazapi";
import { greetingFor } from "@/lib/followup/business-hours";

type Db = ReturnType<typeof createServiceClient>;

/**
 * Nome de perfil do WhatsApp que parece nome de gente ("Claudio Cachiello" sim; "®️©️", "Loja X 🏠",
 * "Vendas" não). Serve só pra cumprimentar — continua valendo perguntar o nome uma vez.
 */
export function nomeDePerfilUsavel(nome: string | null | undefined): string | null {
  const n = nome?.trim();
  if (!n || n.length < 2 || n.length > 40) return null;
  if (!/^[\p{L}][\p{L}' .-]*$/u.test(n)) return null;
  if (/\b(loja|imobili|vendas|corretor|im[oó]veis|ltda|me)\b/i.test(n)) return null;
  return n;
}

/**
 * Primeira abordagem quando o imóvel já é conhecido — pedido do Gines (01/10 e 23/10):
 * saudação → material completo → convite pra visita, NA HORA. O nome é pedido uma vez, sem travar
 * o material (antes a IA perguntava o nome, esperava, e o lead do anúncio esfriava).
 *
 * A IA só manda texto no fim do turno (depois das tools), então a saudação sai daqui, fixa,
 * ANTES; a IA fica com material + convite.
 *
 * Usada pela planilha (lead que ainda não falou no WhatsApp) e pelo clique no anúncio (lead que
 * acabou de mandar a 1ª mensagem).
 */
export async function primeiraAbordagem(
  db: Db,
  conversationId: string,
  telefone: string,
  opts: { nome: string | null; nomeConfirmado: boolean; propertyId: string | null; leadJaFalou: boolean }
) {
  const { nome, nomeConfirmado, propertyId, leadJaFalou } = opts;
  const primeiroNome = nome?.trim().split(/\s+/)[0];
  const regras =
    "Nesta abordagem NÃO chame transferir_para_humano: a pessoa ainda não pediu nada. Se algo falhar, só pergunte em qual imóvel ela tem interesse.";
  const sobreNome = nomeConfirmado
    ? nome
      ? `O nome dela é ${nome}: não pergunte o nome.`
      : ""
    : "O nome dela ainda não foi confirmado: na mensagem final, pergunte o nome UMA vez, de forma leve (ex.: \"E como posso te chamar?\"), junto do convite — sem deixar de mandar o material antes.";

  if (!propertyId) {
    // sem imóvel não há material: a IA cumprimenta e pergunta qual imóvel, numa mensagem só
    await runAgentTurn(conversationId, {
      instrucaoExtra: [
        leadJaFalou
          ? "PRIMEIRA RESPOSTA a quem chamou pelo anúncio."
          : "PRIMEIRA ABORDAGEM: esta pessoa preencheu o formulário de um anúncio e ainda NÃO mandou mensagem no WhatsApp — é você quem inicia a conversa agora.",
        sobreNome,
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
      sobreNome,
      "Agora chame enviar_material e, depois, termine com UMA mensagem curta convidando para conhecer o imóvel (chame oferecer_visita).",
      regras,
    ]
      .filter(Boolean)
      .join(" "),
  });
}
