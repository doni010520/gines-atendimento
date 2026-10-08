/**
 * Lead de anúncio com formulário da Meta chega com um texto automático:
 * "Olá! Preenchi seu formulário e gostaria de saber mais sobre sua empresa.\n\nWhatsApp number: …\nFull name: …"
 * Esse texto não foi escrito pela pessoa — "saber mais sobre sua empresa" é o modelo da Meta,
 * não uma pergunta real. Passado cru pra IA, ela responde "quer que eu fale da empresa?" (08/10/26).
 */

const FORMULARIO_RE = /preenchi (o |seu )?formul[aá]rio|full name\s*:|nome completo\s*:/i;

export function ehMensagemDeFormulario(texto: string | null | undefined): boolean {
  return !!texto && FORMULARIO_RE.test(texto);
}

/** "Full name: Teresa Cristina" → "Teresa Cristina". */
export function nomeDoFormulario(texto: string): string | null {
  const m = texto.match(/^\s*(?:full name|nome completo)\s*:\s*(.+?)\s*$/im);
  const nome = m?.[1]?.replace(/\s+/g, " ").trim();
  return nome && nome.length >= 2 && nome.length <= 80 ? nome : null;
}

/** O que a mensagem do formulário quer dizer de verdade, pra entrar no histórico da IA. */
export function traduzirFormulario(texto: string): string {
  const nome = nomeDoFormulario(texto);
  return (
    `[Mensagem automática do formulário do anúncio — não foi escrita pela pessoa${nome ? `; nome informado: ${nome}` : ""}. ` +
    `Significa: tem interesse no imóvel do anúncio (o imóvel em foco). Não fale de "empresa"; fale do imóvel.]`
  );
}

/** Corpo da mensagem como a IA deve enxergar. */
export function corpoParaIA(texto: string | null | undefined): string {
  if (!texto) return "";
  return ehMensagemDeFormulario(texto) ? traduzirFormulario(texto) : texto;
}
