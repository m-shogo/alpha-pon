// Research OS — 封印（holdout）を開けて確認を1回だけ行うための判定。
//
// 規則（research/holdout/README.md）:
//   - 開封は Production Gate の判定のときだけ（purpose: production_gate）
//   - 1 つの Edge につき 1 回。通るまで開け直すのは Holdout の意味を消す
//   - 条件は事前登録から変えない。結果は access_log に追記し、消せない
//
// ここは純関数だけを置く。ファイルと価格の読み込みは CLI が行う。
// **確認期間の長さは価格を見ずに決める**（取り込み済みの営業日の数で決める）。
// 「クラスタが N 以上たまったら」のように価格から数えると、開ける前に封印を覗くことになる。

import { createHash } from "node:crypto";
import type { HoldoutVaultManifest } from "./signals/holdout-partition.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class HoldoutOpenError extends Error {}

export interface HoldoutAccessEntry {
  schemaVersion: 1;
  id: string;
  edgeId: string;
  windowId: string;
  openedAt: string;
  actor: string;
  purpose: "production_gate";
  result: "pass" | "fail";
  netAlphaBps?: number;
  sampleCount?: number;
  notes?: string;
}

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE.test(value)) throw new HoldoutOpenError(`${label} は YYYY-MM-DD で指定してください: ${value}`);
}

/**
 * 確認期間の終わりを、from 以降の取り込み済み営業日の数で決める。
 * 足りなければ to は null（まだ開けない）。
 */
export function resolveConfirmationRange(input: {
  tradingDates: readonly string[];
  from: string;
  tradingDays: number;
}): { to: string | null; available: number } {
  assertIsoDate(input.from, "from");
  if (!Number.isSafeInteger(input.tradingDays) || input.tradingDays < 1) {
    throw new HoldoutOpenError(`tradingDays は 1 以上の整数で指定してください: ${input.tradingDays}`);
  }
  const eligible = [...new Set(input.tradingDates)].filter((date) => date >= input.from).sort();
  for (const date of eligible) assertIsoDate(date, "取り込み済みの営業日");
  if (eligible.length < input.tradingDays) return { to: null, available: eligible.length };
  return { to: eligible[input.tradingDays - 1]!, available: eligible.length };
}

/**
 * from〜to の平日で、取り込みが完了していない日を返す。1日でもあれば開けない
 * （価格の穴があるまま測ると、やり直せない1回が壊れる）。
 */
export function missingWeekdays(input: {
  from: string;
  to: string;
  completedDates: ReadonlySet<string>;
}): string[] {
  assertIsoDate(input.from, "from");
  assertIsoDate(input.to, "to");
  const missing: string[] = [];
  const cursor = new Date(`${input.from}T00:00:00Z`);
  const end = new Date(`${input.to}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    const date = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !input.completedDates.has(date)) missing.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missing;
}

/** この Edge がすでに開封されていれば止める（1 Edge 1回）。 */
export function assertNotOpenedBefore(
  accessLog: readonly { edgeId: string; purpose: string; openedAt: string; id: string }[],
  edgeId: string,
): void {
  const previous = accessLog.filter((entry) => entry.edgeId === edgeId && entry.purpose === "production_gate");
  if (previous.length > 0) {
    throw new HoldoutOpenError(
      `Edge ${edgeId} は開封済みです（${previous.map((entry) => `${entry.id} @ ${entry.openedAt}`).join(", ")}）。`
      + "開け直せません。条件を変えるなら新しい Edge として登録してください",
    );
  }
}

/** from〜to と重なる封印の窓。 */
export function overlappingWindows(
  manifest: HoldoutVaultManifest,
  from: string,
  to: string,
): string[] {
  return manifest.windows
    .filter((window) => window.from <= to && window.to >= from)
    .map((window) => window.id)
    .sort();
}

/**
 * 事前登録の本文が、開けようとしている条件を書いているか。
 * bundle のパスと確認期間の開始日と営業日数が、すべて本文に現れること。
 */
export function assertPreregistrationMatches(
  text: string,
  expected: { bundlePath: string; from: string; tradingDays: number },
): void {
  const missing: string[] = [];
  if (!text.includes(expected.bundlePath)) missing.push(`bundle ${expected.bundlePath}`);
  if (!text.includes(expected.from)) missing.push(`開始日 ${expected.from}`);
  if (!new RegExp(`(^|[^0-9])${expected.tradingDays}\\s*営業日`).test(text)) {
    missing.push(`${expected.tradingDays} 営業日`);
  }
  if (missing.length > 0) {
    throw new HoldoutOpenError(`事前登録に次の条件が書かれていません: ${missing.join(" / ")}`);
  }
}

/** 合否。補正後 t が閾値以上、かつ Net 平均が正。 */
export function judgeConfirmation(input: {
  clusteredTStat: number | null;
  meanNetAlphaBps: number;
  executedCount: number;
  minT: number;
}): { result: "pass" | "fail"; reason: string } {
  if (!Number.isFinite(input.minT) || input.minT <= 0) {
    throw new HoldoutOpenError(`minT は正の数で指定してください: ${input.minT}`);
  }
  if (input.executedCount === 0 || input.clusteredTStat === null) {
    return { result: "fail", reason: "約定が無い、または t を計算できない" };
  }
  const tOk = input.clusteredTStat >= input.minT;
  const netOk = input.meanNetAlphaBps > 0;
  const reason = `t=${input.clusteredTStat.toFixed(4)}（閾値 ${input.minT}）/ Net ${input.meanNetAlphaBps.toFixed(1)}bps`;
  return { result: tOk && netOk ? "pass" : "fail", reason };
}

export function buildAccessEntry(input: {
  edgeId: string;
  windowId: string;
  openedAt: string;
  actor: string;
  result: "pass" | "fail";
  netAlphaBps: number;
  sampleCount: number;
  notes: string;
}): HoldoutAccessEntry {
  const id = `hold-${createHash("sha256")
    .update(JSON.stringify([input.edgeId, input.windowId, input.openedAt, input.actor, input.notes]))
    .digest("hex")
    .slice(0, 16)}`;
  return {
    schemaVersion: 1,
    id,
    edgeId: input.edgeId,
    windowId: input.windowId,
    openedAt: input.openedAt,
    actor: input.actor,
    purpose: "production_gate",
    result: input.result,
    netAlphaBps: input.netAlphaBps,
    sampleCount: input.sampleCount,
    notes: input.notes,
  };
}
