const JST_TIME_ZONE = "Asia/Tokyo";

export function formatJstDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatJstTimestampDir(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}-${values.minute}-${values.second}`;
}

export function backupAgeDaysFromDirectoryName(name: string, now = new Date()): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2})-(\d{2})-(\d{2}))?$/.exec(name);
  if (!match) return null;

  try {
    if (addDaysJst(match[1], 0) !== match[1]) return null;
  } catch {
    return null;
  }

  const hour = match[2] === undefined ? 0 : Number(match[2]);
  const minute = match[3] === undefined ? 0 : Number(match[3]);
  const second = match[4] === undefined ? 0 : Number(match[4]);
  if (
    !Number.isInteger(hour) || hour < 0 || hour > 23
    || !Number.isInteger(minute) || minute < 0 || minute > 59
    || !Number.isInteger(second) || second < 0 || second > 59
  ) {
    return null;
  }

  const backupAt = new Date(`${match[1]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+09:00`);
  const ageMs = now.getTime() - backupAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
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
  return toCompactDate(addDaysJst(todayJst(), -days));
}

export function addDaysJst(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match || !Number.isInteger(days)) {
    throw new Error("addDaysJst requires a real YYYY-MM-DD date and integer day offset");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcMs);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("addDaysJst requires a real YYYY-MM-DD date and integer day offset");
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function daysSinceJst(dateStr: string): number | null {
  let normalizedDate: string;
  try {
    normalizedDate = addDaysJst(dateStr, 0);
  } catch {
    return null;
  }

  const base = new Date(`${normalizedDate}T00:00:00+09:00`);
  const today = new Date(`${todayJst()}T00:00:00+09:00`);
  return Math.floor((today.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}
