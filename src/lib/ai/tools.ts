export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "buscar_imovel",
      description:
        "Busca imóveis ativos por filtro estruturado (bairro, tipo, faixa de preço, quartos). Use quando a pessoa não veio de um anúncio identificado ou quer ver outras opções. NUNCA invente resultado — sempre chame isso antes de listar imóveis que não estão no contexto já injetado.",
      parameters: {
        type: "object",
        properties: {
          bairro: { type: "string", description: "Bairro ou região, se a pessoa mencionou" },
          tipo: { type: "string", enum: ["venda", "locacao"] },
          preco_max: { type: "number" },
          preco_min: { type: "number" },
          quartos_min: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "focar_imovel",
      description:
        "Define/troca qual imóvel é o foco atual da conversa (a partir de um id retornado por buscar_imovel ou já sugerido no contexto). Chame isso assim que souber com certeza qual imóvel é.",
      parameters: {
        type: "object",
        properties: { property_id: { type: "string" } },
        required: ["property_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "enviar_material",
      description:
        "Envia de verdade, pelo WhatsApp, o material do imóvel em foco: copy (texto), video (criativo) ou pdf (fotos+detalhes). Chame um tipo por vez. Só diga ao cliente que mandou algo DEPOIS de receber o resultado desta tool confirmando enviado=true.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["copy", "video", "pdf"] },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "oferecer_visita",
      description:
        "Convida a pessoa pra marcar uma visita ao imóvel. Chame isso NO MÁXIMO UMA VEZ por conversa — o contexto injetado diz se já foi oferecido. Se já foi oferecido e a pessoa não pediu de novo, NÃO chame — apenas responda a dúvida dela normalmente. O próximo lembrete de visita é automático (follow-up), não depende de você insistir.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_nome",
      description: "Registra o nome real da pessoa quando ELA MESMA informar (não usar nome de exibição do WhatsApp).",
      parameters: {
        type: "object",
        properties: { nome: { type: "string" } },
        required: ["nome"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "transferir_para_humano",
      description:
        "Transfere a conversa para um corretor humano. Chame IMEDIATAMENTE quando: a pessoa topar visitar o imóvel, pedir para falar com uma pessoa/corretor/GINES, ou fizer uma pergunta que você não consegue responder com os dados disponíveis. A IA continua respondendo normalmente até um corretor assumir de fato — isso não te desliga.",
      parameters: {
        type: "object",
        properties: {
          motivo: {
            type: "string",
            enum: ["visita", "duvida_nao_respondida", "pedido_explicito", "outro"],
          },
          resumo: { type: "string", description: "Resumo curto pro corretor entender o contexto rapidamente" },
        },
        required: ["motivo", "resumo"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "finalizar_atendimento",
      description:
        "Encerra o atendimento (para o motor de follow-up) quando a pessoa disser claramente que não tem mais interesse, já comprou/alugou em outro lugar, foi engano, ou pedir pra não receber mais mensagens.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", enum: ["nao_interessado", "comprou_outro", "engano", "pediu_para_parar"] },
        },
        required: ["motivo"],
      },
    },
  },
];

export type ToolName = (typeof TOOLS)[number]["function"]["name"];
