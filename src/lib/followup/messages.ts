// Variações por estágio — nunca manda a mesma frase 2x seguidas pro mesmo contato.
export const STAGE1_MESSAGES = [
  "Oi! Passando pra saber: deu pra dar uma olhada no material? O imóvel bateu com o que você tava procurando? 🏡",
  "Só passando aqui — conseguiu ver a copy e o vídeo que mandei? Faz sentido pra você? Se quiser, já posso ver um horário pra visita.",
  "E aí, alguma dúvida sobre o imóvel? Se curtiu, posso já ir vendo um horário pra você conhecer pessoalmente.",
];

export const STAGE2_MESSAGES = [
  "Se preferir, tem uma opção rápida: consigo liberar uma visita autoguiada — você vai até o imóvel e entra sozinho(a), no seu tempo, sem compromisso. Topa? 🔑",
  "Outra ideia: se estiver perto, posso liberar acesso pra você visitar o imóvel autoguiado, sem precisar agendar com corretor. Quer que eu organize isso?",
];

export const STAGE_LOOP_MESSAGES = [
  "Oi! Só retomando o contato — esse imóvel ainda está disponível, se quiser conversar mais sobre ele é só chamar. 😊",
  "Passando pra lembrar que continuamos com esse imóvel disponível — qualquer dúvida ou se quiser marcar uma visita, é só falar comigo.",
  "Tudo bem? Esse imóvel segue disponível. Se não for mais do seu interesse, é só me avisar que eu paro de mandar mensagem sobre ele.",
];

export function pickMessage(pool: string[], seed: string): string {
  const idx = Math.abs(hashCode(seed)) % pool.length;
  return pool[idx];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
