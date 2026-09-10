// レポート/生成データの鮮度チェック。古い情報を新着扱いで通知しないために使う。

import { existsSync, lstatSync, readFileSync } from "fs";
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

/** ファイルシステムのタイムスタンプ精度と時刻同期のゆらぎを吸収する許容幅。 */
const FUTURE_TOLERANCE_MS = 2_000;

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

  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    return {
      path,
      label,
      exists: true,
      updatedAt: stat.mtime.toISOString(),
      updatedDateJst: jstDate(stat.mtime),
      isFreshToday: false,
      reason: `${label} がstandalone regular fileではない`,
    };
  }

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return {
      path,
      label,
      exists: true,
      updatedAt: stat.mtime.toISOString(),
      updatedDateJst: jstDate(stat.mtime),
      isFreshToday: false,
      reason: `${label} を読み取れない`,
    };
  }

  if (content.trim().length === 0) {
    return {
      path,
      label,
      exists: true,
      updatedAt: stat.mtime.toISOString(),
      updatedDateJst: jstDate(stat.mtime),
      isFreshToday: false,
      reason: `${label} が空ファイル`,
    };
  }

  const updatedAt = stat.mtime;
  const updatedDateJst = jstDate(updatedAt);
  const today = todayJst();
  // ファイルシステムのタイムスタンプ精度により、書き込み直後の mtime が
  // Date.now() より僅かに未来になる。実測では 200 回中 103 回、1ms 先行した
  // (mtimeMs が小数を持つため)。許容ゼロだと、たった今書いた成果物を
  // 「更新時刻が未来」として本日未更新に落としてしまう。
  // 捏造された未来日時は分〜時間単位なので、2 秒の許容で取りこぼさない。
  if (updatedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return {
      path,
      label,
      exists: true,
      updatedAt: updatedAt.toISOString(),
      updatedDateJst,
      isFreshToday: false,
      reason: `${label} の更新時刻が未来: ${updatedAt.toISOString()}`,
    };
  }

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
