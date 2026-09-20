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
 * 確認期間の終わりを、取り込み済みの営業日から決める。
 *
 * 2通りある。
 *   tradingDays: from 以降の N 営業日目（前を向いた確認。終わりは時間が決める）
 *   until:       その日までの最後の営業日（後ろを向いた確認。終わりは最初から決まっている）
 * どちらも**価格は見ない**（取り込み済みの日付の数と並びだけ）。
 */
export function resolveConfirmationRange(input: {
  tradingDates: readonly string[];
  from: string;
  tradingDays?: number;
  until?: string;
}): { to: string | null; available: number; reason?: string } {
  assertIsoDate(input.from, "from");
  if ((input.tradingDays === undefined) === (input.until === undefined)) {
    throw new HoldoutOpenError("tradingDays と until はどちらか一方だけを指定してください");
  }
  const eligible = [...new Set(input.tradingDates)].filter((date) => date >= input.from).sort();
  for (const date of eligible) assertIsoDate(date, "取り込み済みの営業日");

  if (input.until !== undefined) {
    assertIsoDate(input.until, "until");
    if (input.until < input.from) throw new HoldoutOpenError(`until は from 以降にしてください: ${input.until}`);
    const inRange = eligible.filter((date) => date <= input.until!);
    const last = eligible.at(-1);
    // 期間の中に取り込み済みの日が1日も無い（例: 過去側をまだ契約していない）。
    if (inRange.length === 0) {
      return {
        to: null,
        available: 0,
        reason: `${input.from}〜${input.until} に取り込み済みの営業日がありません`
          + `（${input.from} 以降の取り込み済み: ${eligible[0] ?? "なし"}〜${last ?? "なし"}）`,
      };
    }
    // until まで取り込みが届いていないなら、まだ開けない（終わりが動いてしまう）。
    if (last === undefined || last < input.until) {
      return {
        to: null,
        available: inRange.length,
        reason: `取り込みが ${input.until} まで届いていません（最終 ${last ?? "なし"}）`,
      };
    }
    return { to: inRange.at(-1)!, available: inRange.length };
  }

  const tradingDays = input.tradingDays!;
  if (!Number.isSafeInteger(tradingDays) || tradingDays < 1) {
    throw new HoldoutOpenError(`tradingDays は 1 以上の整数で指定してください: ${tradingDays}`);
  }
  if (eligible.length < tradingDays) {
    return { to: null, available: eligible.length, reason: `取り込み済み ${eligible.length} / 必要 ${tradingDays}` };
  }
  return { to: eligible[tradingDays - 1]!, available: eligible.length };
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
 *
 * edgeId も本文が名乗っていること（`- edgeId: \`generic-reversal\`` の形）。
 * これが無いと、同じ bundle を別の edgeId で開けてしまい、「1 Edge 1回」を
 * 引数だけで回避できる（2026-09-18 に下見で気づいた欠陥）。
 */
export function assertPreregistrationMatches(
  text: string,
  expected: {
    bundlePath: string;
    from: string;
    tradingDays?: number;
    until?: string;
    minT: number;
    minClusters: number;
    edgeId?: string;
  },
): void {
  const missing: string[] = [];
  if (!text.includes(expected.bundlePath)) missing.push(`bundle ${expected.bundlePath}`);
  if (expected.edgeId !== undefined) {
    const id = expected.edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 末尾の境界を見る。`generic-reversal` が `generic-reversal-backward` に当たらないように。
    if (!new RegExp("edgeId:\\s*`?" + id + "`?(?![A-Za-z0-9_-])").test(text)) {
      missing.push(`edgeId ${expected.edgeId}`);
    }
  }
  if (!text.includes(expected.from)) missing.push(`開始日 ${expected.from}`);
  if (expected.tradingDays !== undefined
    && !new RegExp(`(^|[^0-9])${expected.tradingDays}\\s*営業日`).test(text)) {
    missing.push(`${expected.tradingDays} 営業日`);
  }
  if (expected.until !== undefined && !text.includes(expected.until)) {
    missing.push(`終了日 ${expected.until}`);
  }
  // 引数の閾値が事前登録と食い違っていないか。数字の一部に一致させない。
  if (!new RegExp(`(^|[^0-9.])${String(expected.minT).replace(".", "\\.")}([^0-9]|$)`).test(text)) {
    missing.push(`閾値 ${expected.minT}`);
  }
  if (!new RegExp(`最小クラスタ ${expected.minClusters}(?![0-9])`).test(text)) {
    missing.push(`最小クラスタ ${expected.minClusters}`);
  }
  if (missing.length > 0) {
    throw new HoldoutOpenError(`事前登録に次の条件が書かれていません: ${missing.join(" / ")}`);
  }
}

/** 合否。補正後 t が閾値以上、かつ Net 平均が正。 */
function assertMinClusters(value: number): void {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new HoldoutOpenError(`minClusters は 2 以上の整数で指定してください: ${value}`);
  }
}

/**
 * 合否。補正後 t が閾値以上、Net 平均が正、クラスタが最小数以上。
 * クラスタが少ないと補正後 t は意味を持たない（2クラスタで |t| = 396 が出た）。
 */
export function judgeConfirmation(input: {
  clusteredTStat: number | null;
  meanNetAlphaBps: number;
  executedCount: number;
  clusterCount: number | null;
  minT: number;
  minClusters: number;
}): { result: "pass" | "fail"; reason: string } {
  if (!Number.isFinite(input.minT) || input.minT <= 0) {
    throw new HoldoutOpenError(`minT は正の数で指定してください: ${input.minT}`);
  }
  assertMinClusters(input.minClusters);
  if (input.executedCount === 0 || input.clusteredTStat === null) {
    return { result: "fail", reason: "約定が無い、または t を計算できない" };
  }
  if ((input.clusterCount ?? 0) < input.minClusters) {
    return { result: "fail", reason: `標本不足: クラスタ ${input.clusterCount ?? 0} < ${input.minClusters}` };
  }
  const tOk = input.clusteredTStat >= input.minT;
  const netOk = input.meanNetAlphaBps > 0;
  const reason = `t=${input.clusteredTStat.toFixed(4)}（閾値 ${input.minT}）/ Net ${input.meanNetAlphaBps.toFixed(1)}bps`;
  return { result: tOk && netOk ? "pass" : "fail", reason };
}

/**
 * 両側の判定（イベントスタディの初回測定用）。|t| が閾値以上なら「向きのある反応がある」。
 * 向きは t の符号で返す。**売買の合否ではない。**
 */
export function judgeEventStudy(input: {
  clusteredTStat: number | null;
  count: number;
  clusterCount: number | null;
  minAbsT: number;
  minClusters: number;
}): { result: "pass" | "fail"; direction: "positive" | "negative" | "none"; reason: string } {
  if (!Number.isFinite(input.minAbsT) || input.minAbsT <= 0) {
    throw new HoldoutOpenError(`minT は正の数で指定してください: ${input.minAbsT}`);
  }
  assertMinClusters(input.minClusters);
  if (input.count === 0 || input.clusteredTStat === null) {
    return { result: "fail", direction: "none", reason: "観測が無い、または t を計算できない" };
  }
  if ((input.clusterCount ?? 0) < input.minClusters) {
    return {
      result: "fail",
      direction: "none",
      reason: `標本不足: クラスタ ${input.clusterCount ?? 0} < ${input.minClusters}`,
    };
  }
  const t = input.clusteredTStat;
  const passed = Math.abs(t) >= input.minAbsT;
  return {
    result: passed ? "pass" : "fail",
    direction: passed ? (t > 0 ? "positive" : "negative") : "none",
    reason: `|t|=${Math.abs(t).toFixed(4)}（閾値 ${input.minAbsT}・両側）/ 符号 ${t >= 0 ? "+" : "-"}`,
  };
}

export function buildAccessEntry(input: {
  edgeId: string;
  windowId: string;
  openedAt: string;
  actor: string;
  result: "pass" | "fail";
  /** コスト後の平均。イベントスタディ（コスト前）では渡さない。 */
  netAlphaBps?: number;
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
    ...(input.netAlphaBps === undefined ? {} : { netAlphaBps: input.netAlphaBps }),
    sampleCount: input.sampleCount,
    notes: input.notes,
  };
}
