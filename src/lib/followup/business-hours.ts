/**
 * Janela e turnos da régua de conversão (regra do Gines, 26/08/26).
 *
 * - Janela permitida: 09h30 às 19h30. Bloqueado das 20h às 09h (descanso e rush matinal).
 * - Turnos: manhã (10h–11h), tarde (14h30–15h30), fim de tarde (17h30–18h30).
 * - Alternância obrigatória: nunca dois follow-ups seguidos no mesmo turno.
 *
 * Domingo segue bloqueado, como já era antes desta régua.
 *
 * São Paulo não tem horário de verão desde 2019, então o offset fixo -03:00 é exato —
 * é o que permite fazer conta de "hora de parede" com os getters UTC, sem dependência.
 */

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

const WINDOW_OPEN = 9 * 60 + 30; // 09:30
const WINDOW_CLOSE = 19 * 60 + 30; // 19:30

export type Shift = "manha" | "tarde" | "fim_tarde";

/** Início do slot sugerido de cada turno. */
const SHIFT_START: Record<Shift, number> = {
  manha: 10 * 60, // 10:00–11:00
  tarde: 14 * 60 + 30, // 14:30–15:30
  fim_tarde: 17 * 60 + 30, // 17:30–18:30
};
const SLOT_LENGTH_MIN = 60;

/** Faixa larga usada pra dizer em que turno um horário qualquer cai. */
const SHIFT_BANDS: Array<{ shift: Shift; from: number; to: number }> = [
  { shift: "manha", from: WINDOW_OPEN, to: 12 * 60 },
  { shift: "tarde", from: 12 * 60, to: 17 * 60 },
  { shift: "fim_tarde", from: 17 * 60, to: WINDOW_CLOSE },
];

const ROTATION: Shift[] = ["manha", "tarde", "fim_tarde"];

/** O turno vem do banco como texto livre — só entra no domínio se for válido. */
export function parseShift(value: string | null | undefined): Shift | null {
  return ROTATION.find((s) => s === value) ?? null;
}

export const SHIFT_LABEL: Record<Shift, string> = {
  manha: "manhã",
  tarde: "início da tarde",
  fim_tarde: "fim de tarde",
};

function toSpWall(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MS);
}

function fromSpWall(wall: Date): Date {
  return new Date(wall.getTime() - TZ_OFFSET_MS);
}

function minutesOfDay(wall: Date): number {
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

function isSunday(wall: Date): boolean {
  return wall.getUTCDay() === 0;
}

/** Está dentro da janela permitida (09h30–19h30, fora de domingo)? */
export function isWithinWindow(date: Date): boolean {
  const wall = toSpWall(date);
  if (isSunday(wall)) return false;
  const m = minutesOfDay(wall);
  return m >= WINDOW_OPEN && m < WINDOW_CLOSE;
}

/** Em qual turno este horário cai — null se está fora da janela. */
export function shiftOf(date: Date): Shift | null {
  if (!isWithinWindow(date)) return null;
  const m = minutesOfDay(toSpWall(date));
  return SHIFT_BANDS.find((b) => m >= b.from && m < b.to)?.shift ?? null;
}

/**
 * Garante a alternância: se o turno sugerido pro estágio é o mesmo do último envio,
 * pula pro próximo da rotação.
 */
export function resolveShift(preferred: Shift, lastShift: Shift | null): Shift {
  if (!lastShift || preferred !== lastShift) return preferred;
  return ROTATION[(ROTATION.indexOf(preferred) + 1) % ROTATION.length];
}

/**
 * Próxima ocorrência do slot desse turno, a partir de `from`.
 * `minDaysAhead` empurra a contagem N dias (é o que separa D1 / D3 / D7).
 */
export function nextShiftSlot(from: Date, shift: Shift, minDaysAhead = 0): Date {
  const wall = toSpWall(from);
  const target = SHIFT_START[shift];

  const day = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 0, 0, 0, 0)
  );
  day.setUTCDate(day.getUTCDate() + minDaysAhead);

  for (let i = 0; i < 21; i++) {
    const slot = new Date(day.getTime() + target * 60_000);
    if (!isSunday(slot) && slot.getTime() > wall.getTime()) return fromSpWall(slot);
    day.setUTCDate(day.getUTCDate() + 1);
  }
  // inalcançável na prática (21 dias sempre contêm um dia útil), mas nunca retorna inválido
  return fromSpWall(new Date(day.getTime() + target * 60_000));
}

/**
 * Pode disparar agora? Sim quando está dentro do slot do turno certo — ou quando o slot
 * já passou mas ainda estamos na janela permitida e num turno diferente do último envio
 * (recuperação de atraso: cron parado, fila grande). Nunca fura a alternância.
 */
export function shouldSendNow(now: Date, shift: Shift, lastShift: Shift | null): boolean {
  const current = shiftOf(now);
  if (!current) return false;
  if (lastShift && current === lastShift) return false;
  if (current === shift) return true;
  return minutesOfDay(toSpWall(now)) > SHIFT_START[shift] + SLOT_LENGTH_MIN;
}

/**
 * Modo de teste: comprime D1/D3/D7 em minutos e libera a janela, pra validar a régua
 * inteira em poucos minutos em vez de uma semana.
 *
 * Exige DEBUG=true JUNTO com FOLLOWUP_TEST_GAP_MIN — em produção DEBUG é "false", então
 * a variável sozinha não faz nada. Sem essa dupla trava, um valor esquecido no ambiente
 * mandaria as 3 mensagens da régua em minutos, de madrugada, pra cliente real.
 *
 * @returns intervalo em ms entre estágios, ou null quando o modo está desligado.
 */
export function modoTesteGapMs(): number | null {
  if (process.env.DEBUG !== "true") return null;
  const bruto = Number(process.env.FOLLOWUP_TEST_GAP_MIN);
  if (!Number.isFinite(bruto) || bruto <= 0) return null;
  const minutos = Math.min(60, Math.max(1, Math.floor(bruto)));
  return minutos * 60_000;
}

/** Saudação correta pro horário real do disparo (o slot pode escorregar). */
export function greetingFor(date: Date): string {
  const m = minutesOfDay(toSpWall(date));
  if (m < 12 * 60) return "Bom dia";
  if (m < 18 * 60) return "Boa tarde";
  return "Boa noite";
}
