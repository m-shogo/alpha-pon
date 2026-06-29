// レポート/生成データの鮮度チェック。古い情報を新着扱いで通知しないために使う。

import { existsSync, statSync } from "fs";
import { todayJst } from "./date.js";

export type FreshnessResult = {
  path: string;
  label: string;
  exists: boolean;
  updatedAt: string | null;
  updatedDateJst: string | null;
  isFreshToday: boolean;
  reason: string;
};

function jstDate(value: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function freshnessOf(path: string, label = path): FreshnessResult {
  if (!existsSync(path)) {
    return {
      path,
      label,
      exists: false,
      updatedAt: null,
      updatedDateJst: null,
      isFreshToday: false,
      reason: `${label} が存在しない`,
    };
  }

  const updatedAt = statSync(path).mtime;
  const updatedDateJst = jstDate(updatedAt);
  const today = todayJst();
  const isFreshToday = updatedDateJst === today;
  return {
    path,
    label,
    exists: true,
    updatedAt: updatedAt.toISOString(),
    updatedDateJst,
    isFreshToday,
    reason: isFreshToday ? `${label} は本日更新` : `${label} が本日未更新: ${updatedDateJst}`,
  };
}

export function freshnessSummary(paths: Array<{ path: string; label: string }>): FreshnessResult[] {
  return paths.map(item => freshnessOf(item.path, item.label));
}
