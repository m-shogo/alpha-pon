const JST_TIME_ZONE = "Asia/Tokyo";

export function formatJstDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayJst(): string {
  return formatJstDate(new Date());
}

export function toCompactDate(date: string): string {
  return date.replace(/-/g, "");
}

export function todayJstCompact(): string {
  return toCompactDate(todayJst());
}

export function dateNDaysAgoJst(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toCompactDate(formatJstDate(date));
}

export function addDaysJst(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);
  return formatJstDate(date);
}

export function daysSinceJst(dateStr: string): number | null {
  const base = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return null;

  const today = new Date(`${todayJst()}T00:00:00+09:00`);
  return Math.floor((today.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}
