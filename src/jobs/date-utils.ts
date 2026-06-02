// 日本時間 Asia/Tokyo 基準の日付ユーティリティ
// sv-SE ロケールは YYYY-MM-DD を返す

export function getTodayInTokyo(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function subtractDays(dateStr: string, n: number): string {
  return addDays(dateStr, -n);
}

export function getDatesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = from;
  while (cur <= to) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}
