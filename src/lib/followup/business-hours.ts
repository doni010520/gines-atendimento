/**
 * Janela de horário da cadência de follow-up.
 *
 * - Janela permitida: 09h30 às 19h30 (regra do Gines, 26/08/26). Bloqueado das 20h às 09h.
 * - Domingo segue bloqueado.
 * - Toque que vence fora da janela é adiado pro próximo horário permitido — nunca pulado.
 *
 * A rotação de turnos da régua D1/D3/D7 saiu junto com ela: a cadência nova conta horas
 * a partir da última mensagem do robô, então não há mais "turno certo" por estágio.
 *
 * São Paulo não tem horário de verão desde 2019, então o offset fixo -03:00 é exato —
 * é o que permite fazer conta de "hora de parede" com os getters UTC, sem dependência.
 */

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

const WINDOW_OPEN = 9 * 60 + 30; // 09:30
const WINDOW_CLOSE = 19 * 60 + 30; // 19:30

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

/**
 * O próprio horário, se está na janela; senão a próxima abertura (09h30 do próximo dia
 * permitido). É o que adia um toque que venceu de madrugada ou no domingo.
 */
export function nextAllowedTime(date: Date): Date {
  if (isWithinWindow(date)) return date;
  const wall = toSpWall(date);
  const day = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 0, 0, 0, 0));
  // ainda antes da abertura hoje: abre hoje mesmo (se não for domingo)
  if (minutesOfDay(wall) >= WINDOW_OPEN) day.setUTCDate(day.getUTCDate() + 1);
  for (let i = 0; i < 7; i++) {
    if (!isSunday(day)) return fromSpWall(new Date(day.getTime() + WINDOW_OPEN * 60_000));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  // inalcançável (7 dias sempre têm dia útil), mas nunca retorna inválido
  return fromSpWall(new Date(day.getTime() + WINDOW_OPEN * 60_000));
}

/**
 * Modo de teste: comprime a cadência (cada toque vira N minutos depois do anterior, contando
 * da âncora) e libera a janela, pra validar os 6 toques em minutos em vez de 9 dias.
 *
 * Exige DEBUG=true JUNTO com FOLLOWUP_TEST_GAP_MIN — em produção DEBUG é "false", então
 * a variável sozinha não faz nada. Sem essa dupla trava, um valor esquecido no ambiente
 * mandaria a cadência inteira em minutos, de madrugada, pra cliente real.
 *
 * @returns intervalo em ms entre toques, ou null quando o modo está desligado.
 */
export function modoTesteGapMs(): number | null {
  if (process.env.DEBUG !== "true") return null;
  const bruto = Number(process.env.FOLLOWUP_TEST_GAP_MIN);
  if (!Number.isFinite(bruto) || bruto <= 0) return null;
  const minutos = Math.min(60, Math.max(1, Math.floor(bruto)));
  return minutos * 60_000;
}

/** Saudação correta pro horário real do disparo. */
export function greetingFor(date: Date): string {
  const m = minutesOfDay(toSpWall(date));
  if (m < 12 * 60) return "Bom dia";
  if (m < 18 * 60) return "Boa tarde";
  return "Boa noite";
}
