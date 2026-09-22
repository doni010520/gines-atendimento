/**
 * Fonte única de verdade dos rótulos e tons de status.
 *
 * Antes existiam duas tabelas independentes — uma em `inbox/page.tsx`, outra em
 * `imoveis/StatusSelect.tsx` — e elas já divergiam. Qualquer tela que mostre
 * status lê daqui.
 */

export type Tone = "info" | "warn" | "ok" | "mute";

/** Classes do pill de status, por tom. */
export const TONE_CLASS: Record<Tone, string> = {
  info: "bg-primary-soft text-primary-ink",
  warn: "bg-warn-soft text-warn-ink",
  ok: "bg-ok-soft text-ok-ink",
  mute: "bg-mute-soft text-ink-muted",
};

type Entry = { label: string; tone: Tone };

/** Status de conversa — espelha o enum `conversation_status` do banco. */
export const CONVERSATION_STATUS: Record<string, Entry> = {
  bot: { label: "Com o robô", tone: "info" },
  queued: { label: "Aguardando corretor", tone: "warn" },
  open: { label: "Em atendimento", tone: "ok" },
  closed: { label: "Encerrado", tone: "mute" },
};

export function conversationStatus(status: string): Entry {
  return CONVERSATION_STATUS[status] ?? CONVERSATION_STATUS.bot;
}

/** Status de imóvel. A ordem aqui é a ordem do select. */
export const PROPERTY_STATUS: Record<string, Entry> = {
  ativo: { label: "Ativo", tone: "ok" },
  reservado: { label: "Reservado", tone: "warn" },
  vendido: { label: "Vendido", tone: "info" },
  inativo: { label: "Inativo", tone: "mute" },
};

export function propertyStatus(status: string): Entry {
  return PROPERTY_STATUS[status] ?? PROPERTY_STATUS.ativo;
}
