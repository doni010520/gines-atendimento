/**
 * Formatação de data, hora e dinheiro para o painel.
 *
 * Todo horário é renderizado em `America/Sao_Paulo`, explícito — é a convenção
 * que o resto do projeto já segue (`lib/ai/prompt.ts`, `api/debug/route.ts`).
 * As telas do Inbox usavam `toLocaleString("pt-BR")` sem fuso, o que num
 * container em UTC mostrava a hora três horas errada.
 */

const TZ = "America/Sao_Paulo";

const hhmm = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

const diaMes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });

const completo = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: TZ,
});

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Chave `aaaa-mm-dd` no fuso de São Paulo, para comparar dias sem erro de UTC. */
function diaEm(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(d);
}

/** "14:32" se foi hoje, "ontem", senão "12/08". */
export function quando(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const agora = new Date();
  const hoje = diaEm(agora);
  const ontem = diaEm(new Date(agora.getTime() - 86_400_000));
  const dia = diaEm(d);

  if (dia === hoje) return hhmm.format(d);
  if (dia === ontem) return "ontem";
  return diaMes.format(d);
}

/** Data e hora completas, para o balão de mensagem. */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : completo.format(d);
}

/** "há 12 min", "há 2 h", "há 3 dias" — o tempo que alguém está esperando. */
export function esperando(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;

  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas} h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/** "R$ 890.000" — sem centavos, que em preço de imóvel só polui. */
export function preco(valor: number | null | undefined): string {
  return valor == null ? "—" : brl.format(valor);
}
