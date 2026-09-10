// daily レポートの「0件」が何を意味するのかを区別する。
//
// 背景:
//   2026-09-10 のレポートは即通知0 / 朝まとめ0 / ログ0 / 全銘柄スコア空で、
//   一見「今日は候補がなかった」ように読めた。実際は J-Quants が 403 を返して
//   全銘柄の株価取得が失敗し、**1件もスコアできていなかった**。
//   「候補が無い」と「データが無い」が同じ見た目になっていたのが問題。
//
// 方針:
//   スコア算出できた件数とデータ品質の内訳から可用性を判定し、
//   degraded / unavailable のときはレポート冒頭に必ず出す。
//   daily は止めない（既存の設計方針）。見えるようにするだけ。

import type { DataQuality } from "./types.js";

export type DailyDataAvailability = "ok" | "degraded" | "unavailable";

export interface DailyDataHealthInput {
  /** スコア算出まで到達した結果。 */
  results: ReadonlyArray<{ dataQuality: DataQuality }>;
  /** スコア算出を試みた母数（watchlist の有効銘柄数）。 */
  attemptedCount: number;
  /** dataQuality が ok の比率がこれ未満なら degraded。既定 0.5。 */
  minUsableRatio?: number;
}

export interface DailyDataHealth {
  availability: DailyDataAvailability;
  attemptedCount: number;
  scoredCount: number;
  usableCount: number;
  partialCount: number;
  missingCount: number;
  /** scoredCount が 0 なら null。0 と「算出不能」を取り違えないため。 */
  usableRatio: number | null;
  warnings: string[];
}

const DEFAULT_MIN_USABLE_RATIO = 0.5;

export function assessDailyDataHealth(input: DailyDataHealthInput): DailyDataHealth {
  if (!Number.isSafeInteger(input.attemptedCount) || input.attemptedCount < 0) {
    throw new Error(`attemptedCount must be a non-negative safe integer: ${input.attemptedCount}`);
  }
  const minUsableRatio = input.minUsableRatio ?? DEFAULT_MIN_USABLE_RATIO;
  if (!Number.isFinite(minUsableRatio) || minUsableRatio < 0 || minUsableRatio > 1) {
    throw new Error(`minUsableRatio must be within [0, 1]: ${minUsableRatio}`);
  }
  if (input.results.length > input.attemptedCount) {
    throw new Error(
      `scored results (${input.results.length}) cannot exceed attemptedCount (${input.attemptedCount})`,
    );
  }

  const scoredCount = input.results.length;
  let usableCount = 0;
  let partialCount = 0;
  let missingCount = 0;
  for (const result of input.results) {
    if (result.dataQuality === "ok") usableCount += 1;
    else if (result.dataQuality === "partial") partialCount += 1;
    else missingCount += 1;
  }

  const usableRatio = scoredCount === 0 ? null : usableCount / scoredCount;
  const warnings: string[] = [];
  const failedCount = input.attemptedCount - scoredCount;

  let availability: DailyDataAvailability;
  if (input.attemptedCount === 0) {
    // 監視対象そのものが空。データの問題ではなく設定の問題。
    availability = "unavailable";
    warnings.push("監視対象の銘柄が0件です。watchlist を確認してください");
  } else if (scoredCount === 0) {
    availability = "unavailable";
    warnings.push(
      `監視対象 ${input.attemptedCount} 件のうち、スコア算出できたのは 0 件です。`
      + "この結果は「候補がない」ではなく「データが取得できていない」可能性が高い",
    );
  } else {
    if (failedCount > 0) {
      warnings.push(`監視対象 ${input.attemptedCount} 件のうち ${failedCount} 件がスコア算出前に失敗しました`);
    }
    if (usableRatio !== null && usableRatio < minUsableRatio) {
      warnings.push(
        `データ品質が ok の銘柄は ${usableCount}/${scoredCount} 件で、`
        + `閾値 ${Math.round(minUsableRatio * 100)}% を下回っています`,
      );
    }
    availability = warnings.length > 0 ? "degraded" : "ok";
  }

  return {
    availability,
    attemptedCount: input.attemptedCount,
    scoredCount,
    usableCount,
    partialCount,
    missingCount,
    usableRatio,
    warnings,
  };
}

/** レポート冒頭に出す注意書き。availability が ok なら空配列。 */
export function formatDailyDataHealthBanner(health: DailyDataHealth): string[] {
  if (health.availability === "ok") return [];
  const headline = health.availability === "unavailable"
    ? "🛑 **データを取得できていません。この件数は「候補がない」ことを意味しません。**"
    : "⚠️ **データ取得が不完全です。件数を鵜呑みにしないでください。**";
  const lines = [`> ${headline}`, ">"];
  for (const warning of health.warnings) lines.push(`> - ${warning}`);
  lines.push(
    `> - 内訳: 監視対象 ${health.attemptedCount} / スコア算出 ${health.scoredCount} / `
    + `ok ${health.usableCount} ・ partial ${health.partialCount} ・ missing ${health.missingCount}`,
  );
  lines.push("");
  return lines;
}
