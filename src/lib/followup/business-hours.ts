/**
 * Janela de horário da cadência de follow-up.
 *
 * - Horário e dias permitidos vêm do painel (/cadencia, tabela followup_settings).
 *   Padrão: 09h30 às 19h30, segunda a sábado (regra do Gines, 26/08/26).
 * - Toque que vence fora da janela é adiado pro próximo horário permitido — nunca pulado.
 *
 * A rotação de turnos da régua D1/D3/D7 saiu junto com ela: a cadência nova conta horas
 * a partir da última mensagem do robô, então não há mais "turno certo" por estágio.
 *
 * São Paulo não tem horário de verão desde 2019, então o offset fixo -03:00 é exato —
 * é o que permite fazer conta de "hora de parede" com os getters UTC, sem dependência.
 */

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

/** Janela de envio: minutos do dia (hora de São Paulo) e dias da semana (0 = domingo). */
export type Janela = { inicio: number; fim: number; dias: number[] };

export const JANELA_PADRAO: Janela = { inicio: 9 * 60 + 30, fim: 19 * 60 + 30, dias: [1, 2, 3, 4, 5, 6] };

/** Janela utilizável: sem dia permitido ou com início >= fim nunca haveria envio — cai no padrão. */
export function normalizarJanela(j: Partial<Janela> | null | undefined): Janela {
  const inicio = Number(j?.inicio);
  const fim = Number(j?.fim);
  const dias = (j?.dias ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || inicio < 0 || fim > 24 * 60 || inicio >= fim || dias.length === 0) {
    return JANELA_PADRAO;
  }
  return { inicio, fim, dias: [...new Set(dias)].sort((a, b) => a - b) };
}

function toSpWall(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MS);
}

function fromSpWall(wall: Date): Date {
  return new Date(wall.getTime() - TZ_OFFSET_MS);
}

function minutesOfDay(wall: Date): number {
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

/** Está dentro da janela permitida (horário e dia da semana)? */
export function isWithinWindow(date: Date, janela: Janela = JANELA_PADRAO): boolean {
  const wall = toSpWall(date);
  if (!janela.dias.includes(wall.getUTCDay())) return false;
  const m = minutesOfDay(wall);
  return m >= janela.inicio && m < janela.fim;
}

/**
 * O próprio horário, se está na janela; senão a próxima abertura (início da janela no
 * próximo dia permitido). É o que adia um toque que venceu de madrugada ou em dia bloqueado.
 */
export function nextAllowedTime(date: Date, janela: Janela = JANELA_PADRAO): Date {
  if (isWithinWindow(date, janela)) return date;
  const wall = toSpWall(date);
  const day = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 0, 0, 0, 0));
  // ainda antes da abertura hoje: abre hoje mesmo (se hoje for dia permitido)
  if (minutesOfDay(wall) >= janela.inicio) day.setUTCDate(day.getUTCDate() + 1);
  for (let i = 0; i < 8; i++) {
    if (janela.dias.includes(day.getUTCDay())) return fromSpWall(new Date(day.getTime() + janela.inicio * 60_000));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  // inalcançável (normalizarJanela garante ao menos um dia), mas nunca retorna inválido
  return fromSpWall(new Date(day.getTime() + janela.inicio * 60_000));
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
