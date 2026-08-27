export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "buscar_imovel",
      description:
        "Busca imóveis ativos por filtro estruturado. Use quando a pessoa não veio de um anúncio identificado ou quer ver outras opções. Preencha SÓ os campos que a pessoa realmente mencionou — não invente cidade/bairro/tipo que ela não disse. A busca de localização é APROXIMADA (tolera erro de grafia, e também olha endereço/descrição — então avenida próxima ou ponto de referência que a pessoa citar também pode bater). NUNCA invente resultado — sempre chame isso antes de listar imóveis que não estão no contexto já injetado. Se voltar vazio, pode tentar de novo com um termo mais genérico antes de dizer que não tem.",
      parameters: {
        type: "object",
        properties: {
          cidade: { type: "string", description: "Cidade, se a pessoa mencionou (ex: São Paulo)" },
          bairro: {
            type: "string",
            description:
              "Bairro, região, avenida próxima ou ponto de referência que a pessoa mencionou (ex: Vila Madalena, ou 'perto do Parque Villa Lobos') — NÃO coloque a cidade aqui. Pode escrever como a pessoa falou, não precisa ser a grafia exata.",
          },
          tipo_imovel: {
            type: "string",
            description: "Tipo físico do imóvel, se a pessoa mencionou (ex: casa, apartamento, sobrado, cobertura, terreno) — não confundir com venda/locação",
          },
          tipo: { type: "string", enum: ["venda", "locacao"], description: "Modalidade: venda ou locação — só se a pessoa deixou claro" },
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
        "Envia de verdade, pelo WhatsApp, TODO o material do imóvel em foco de uma vez só: copy (texto), vídeo do criativo (se existir) e PDF (se existir). Uma chamada manda o bloco inteiro — não precisa (e não deve) chamar de novo pra completar. Confirme ao cliente SÓ o que o resultado da tool disser que foi enviado de verdade (enviado_copy/enviado_video/enviado_pdf) — nunca diga 'mandei tudo' sem checar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "oferecer_visita",
      description:
        "Registra e faz o convite de visita ao imóvel. Chame sempre que fechar uma resposta com o convite — é ela que conta o teto. LIMITE: no máximo DOIS convites por conversa (o contexto injetado diz quantos já foram feitos). Atingido o teto, não convide mais por iniciativa própria: responda a dúvida normalmente. A visita é agendada com só 1 hora de antecedência, em qualquer dia da semana. Os próximos lembretes são automáticos (follow-up), não dependem de você insistir.",
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
        "Transfere a conversa para o Gines. Chame IMEDIATAMENTE quando: a pessoa quiser agendar visita ou visitar imediatamente, pedir para falar com uma pessoa/corretor/GINES, ou fizer uma pergunta sobre o imóvel ou a negociação que não está na KNOWLEDGE_BASE_IMOVEL. A tool devolve em mensagem_para_o_cliente a frase EXATA que você deve responder — não escreva nada além dela. A IA continua respondendo normalmente até um humano assumir de fato: isso não te desliga.",
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
        "Encerra o atendimento e interrompe a régua de follow-up PERMANENTEMENTE quando a pessoa responder de forma negativa em qualquer etapa: não tem interesse, já comprou/alugou em outro lugar, foi engano, ou pediu pra não receber mais mensagens. A própria tool envia a despedida ao cliente — depois de chamá-la, não escreva mais nada.",
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
