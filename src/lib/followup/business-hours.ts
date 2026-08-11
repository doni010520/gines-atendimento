const TZ = "America/Sao_Paulo";
const OPEN_HOUR = 8;
const CLOSE_HOUR = 20;

function partsInTz(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday, hour };
}

export function isBusinessHours(date: Date): boolean {
  const { weekday, hour } = partsInTz(date);
  if (weekday === "Sun") return false;
  return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

/** Se `date` cai fora do horário comercial, empurra pro próximo horário de abertura. */
export function nextBusinessMoment(date: Date): Date {
  const d = new Date(date);
  for (let i = 0; i < 14; i++) {
    if (isBusinessHours(d)) return d;
    const { hour } = partsInTz(d);
    if (hour >= CLOSE_HOUR) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(OPEN_HOUR + 3, 0, 0, 0); // aproximação simples de America/Sao_Paulo (UTC-3)
    } else {
      d.setUTCHours(OPEN_HOUR + 3, 0, 0, 0);
    }
  }
  return d;
}
