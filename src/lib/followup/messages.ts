/**
 * Copies da régua de conversão — texto do Gines (26/08/26), com os campos entre colchetes
 * preenchidos a partir do imóvel em foco.
 *
 * Duas adaptações conscientes sobre o texto original, pra régua servir a qualquer imóvel
 * da base (e não só à casa da Vila Madalena) sem afirmar nada que não seja verdade:
 *  - o substantivo concorda com o tipo do imóvel (casa/apartamento/sobrado...);
 *  - a afirmação "100% reformada e modernizada" só entra quando a base do imóvel diz isso.
 */

export type CopyVars = {
  nome: string | null;
  /** [Bairro/Localização do Imóvel] */
  local: string;
  /** casa | apartamento | sobrado | ... (cai pra "imóvel" quando não cadastrado) */
  tipo: string;
  /** [IA: destaque visual/arquitetônico] — encaixa em "Acredito que ___ chamou sua atenção" */
  destaqueVisual: string;
  /** [IA: diferencial técnico ou de acabamento] — encaixa em "já conta com ___" */
  destaqueTecnico: string;
  /** a base do imóvel sustenta a afirmação de reforma/modernização? */
  reformado: boolean;
  /** materiais que existem de fato pra esse imóvel */
  temPdf: boolean;
  temVideo: boolean;
  /** saudação da hora real do disparo — o slot pode escorregar dentro da janela */
  saudacao: string;
};

const FEMININO = /^(casa|cobertura|ch[áa]cara|fazenda|sala|loja|kitnet)/i;

/** Plural pt-BR suficiente pros tipos que existem na base (casa, apartamento, imóvel...). */
function plural(palavra: string): string {
  const p = palavra.trim();
  if (/el$/i.test(p)) return `${p.slice(0, -2)}eis`; // imóvel -> imóveis
  if (/l$/i.test(p)) return `${p.slice(0, -1)}is`; // casal -> casais
  if (/[rsz]$/i.test(p)) return `${p}es`;
  return `${p}s`;
}

function genero(tipo: string) {
  const fem = FEMININO.test(tipo.trim());
  return {
    artigo: fem ? "a" : "o",
    demonstrativo: fem ? "dessa" : "desse",
    esse: fem ? "essa" : "esse",
    plural: plural(tipo),
    reformado: fem ? "reformada" : "reformado",
    modernizado: fem ? "modernizada" : "modernizado",
    pronome: fem ? "ela" : "ele",
    liberado: fem ? "liberada" : "liberado",
    prontas: fem ? "prontas" : "prontos",
    totalmente: fem ? "totalmente reformadas" : "totalmente reformados",
  };
}

function vocativo(nome: string | null) {
  return nome?.trim() ? `, ${nome.trim()}` : "";
}

/** Bairro/cidade só entram na frase quando estão cadastrados. */
function localSuffix(v: CopyVars) {
  return v.local?.trim() ? ` em ${v.local.trim()}` : "";
}

function materiais(v: CopyVars) {
  if (v.temPdf && v.temVideo) return "no PDF e no vídeo";
  if (v.temPdf) return "no PDF";
  if (v.temVideo) return "no vídeo";
  return "no material";
}

/** D1 — fim de tarde. Recepção do material + facilidade de visitação. */
export function copyDia1(v: CopyVars): string {
  const g = genero(v.tipo);
  // sem destaque sustentado pela base do imóvel, a frase sai — não se inventa característica
  const destaque = v.destaqueVisual ? `Acredito que ${v.destaqueVisual} chamou sua atenção. ` : "";
  return (
    `Olá${vocativo(v.nome)}! Conseguiu dar uma olhada ${materiais(v)} d${g.artigo} ${v.tipo}${localSuffix(v)} que enviei? ` +
    destaque +
    `Se ficou alguma dúvida sobre a planta ou as condições de negociação, estou aqui para ajudar. ` +
    `Nossa operação é super ágil: com apenas 1 hora de antecedência, consigo agendar sua visita para qualquer dia da semana. ` +
    `O que acha de conhecermos o espaço nos próximos dias?`
  );
}

/** D3 — manhã. Pronto para morar + diferencial técnico. */
export function copyDia3(v: CopyVars): string {
  const g = genero(v.tipo);
  const abertura = `${v.saudacao}${vocativo(v.nome)}! Tudo bem? Passando rapidamente para destacar um detalhe importante ${g.demonstrativo} ${v.tipo}:`;
  const fechamento =
    `Gostaria de ver o nível do acabamento pessoalmente? ` +
    `Como temos muita flexibilidade de horários, você escolhe o melhor dia e eu organizo o acesso rapidinho para você.`;

  if (v.reformado) {
    // aqui o substantivo repetido é do texto original do Gines — vem depois de duas frases,
    // então não soa repetitivo como colado na abertura
    const tecnico = v.destaqueTecnico ? `Além disso, ${g.artigo} ${v.tipo} já conta com ${v.destaqueTecnico}. ` : "";
    return (
      `${abertura} ${g.pronome} foi 100% ${g.reformado} e ${g.modernizado}. ` +
      `É literalmente receber as chaves e mudar, sem nenhuma dor de cabeça com obras. ` +
      tecnico +
      fechamento
    );
  }
  // sem a frase da reforma, o técnico encosta na abertura — usa pronome pra não repetir
  // o substantivo ("desse sobrado: o sobrado já conta com...")
  if (v.destaqueTecnico) return `${abertura} ${g.pronome} já conta com ${v.destaqueTecnico}. ${fechamento}`;
  // nem reforma nem diferencial cadastrado: vira um retorno honesto, sem promessa nenhuma
  return `${v.saudacao}${vocativo(v.nome)}! Tudo bem? Passando para saber se ficou alguma dúvida sobre ${g.esse} ${v.tipo}. ${fechamento}`;
}

/** D7 — início da tarde. Escassez sutil + despedida que força uma resposta. */
export function copyDia7(v: CopyVars): string {
  const g = genero(v.tipo);
  const abertura =
    v.reformado && /^casa/i.test(v.tipo)
      ? `Casas de rua ${g.totalmente} e ${g.prontas} para morar${localSuffix(v)} costumam ter uma liquidez bem alta.`
      : `${g.plural.charAt(0).toUpperCase()}${g.plural.slice(1)} como ${g.esse}${localSuffix(v)} costumam ter uma liquidez bem alta.`;

  return (
    `Olá${vocativo(v.nome)}. ${abertura} ` +
    `Como não tivemos retorno, este será meu último contato ativo para não ser inconveniente. ` +
    `Lembrando que você tem total facilidade para visitar: basta me avisar com 1 horinha de antecedência e ${g.artigo} ${v.tipo} estará ${g.liberado} para você conhecer, no dia que preferir. ` +
    `Podemos deixar uma visita pré-agendada, ou no momento você pausou as buscas?`
  );
}

/** Regra de ouro: resposta negativa encerra a cadência de vez. */
export function copyOptOut(nome: string | null): string {
  return `Agradeço o retorno${vocativo(nome)}! Se precisar de algo no futuro, estarei à disposição. Um excelente dia!`;
}

/** Frase fixa de transbordo — a IA não improvisa essa. */
export const MENSAGEM_HANDOFF =
  "Excelente! Vou chamar o Gines agora mesmo para assumir o atendimento e alinhar esse detalhe diretamente com você. Um momento, por favor.";
