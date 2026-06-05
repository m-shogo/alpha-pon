/**
 * 特殊状況ウォッチ outcome マッチングユーティリティ
 *
 * hypothesis.reason に "[special_situation]" マーカーを持つ outcome を
 * 通常スキャナー由来の outcome と区別するための共有ロジック。
 *
 * 優先度:
 *   1. [special_situation] マーカーあり → 特殊状況専用として扱う
 *   2. マーカーなし + コード一致 → 通常 outcome として区別し、混在注記を付ける
 */

import type { HypothesisOutcome } from "./universe.js";

/** hypothesis.reason に付与される識別マーカー */
export const SPECIAL_SITUATION_MARKER = "[special_situation]";

/** outcome が special_situation 由来かどうか判定 */
export function isSpecialSituationOutcome(outcome: HypothesisOutcome): boolean {
  return (outcome.hypothesis.reason ?? "").includes(SPECIAL_SITUATION_MARKER);
}

/**
 * 候補コードに一致する outcomes を special / normal に分離して返す。
 *
 * matchMode:
 *   "special_only"   - [special_situation] マーカーを持つもののみ
 *   "normal_only"    - マーカーなしのもののみ
 *   "special_prefer" - special があれば special のみ、なければ normal も含む
 *   "all"            - コード一致する全て（混在あり、注記を付けること）
 */
export function filterOutcomesByCode(
  outcomes: HypothesisOutcome[],
  codes: Set<string>,
  matchMode: "special_only" | "normal_only" | "special_prefer" | "all" = "special_prefer"
): { special: HypothesisOutcome[]; normal: HypothesisOutcome[]; mixed: boolean } {
  const matched = outcomes.filter(o => codes.has(o.code));
  const special = matched.filter(isSpecialSituationOutcome);
  const normal = matched.filter(o => !isSpecialSituationOutcome(o));

  if (matchMode === "special_only") {
    return { special, normal: [], mixed: false };
  }
  if (matchMode === "normal_only") {
    return { special: [], normal, mixed: false };
  }
  if (matchMode === "special_prefer") {
    // special がある code は special のみ使う
    const specialCodes = new Set(special.map(o => o.code));
    const normalFallback = normal.filter(o => !specialCodes.has(o.code));
    return {
      special,
      normal: normalFallback,
      mixed: normalFallback.length > 0,
    };
  }
  // "all"
  return { special, normal, mixed: normal.length > 0 };
}

/**
 * 特殊状況ウォッチ向けの outcomeStats 計算に使うべき outcomes を返す。
 * - code に [special_situation] outcome があればそれだけを使う
 * - なければ通常 outcome を使い、mixed フラグを立てる
 */
export function selectOutcomesForStats(
  outcomes: HypothesisOutcome[],
  code: string
): { selected: HypothesisOutcome[]; source: "special" | "normal" | "mixed" | "none" } {
  const forCode = outcomes.filter(o => o.code === code);
  const special = forCode.filter(isSpecialSituationOutcome);
  const normal = forCode.filter(o => !isSpecialSituationOutcome(o));

  if (special.length > 0) return { selected: special, source: "special" };
  if (normal.length > 0) return { selected: normal, source: "normal" };
  return { selected: [], source: "none" };
}

/**
 * 通常 outcome と special outcome が同じコードに混在しているかを検出する。
 * レポートの警告表示に使う。
 */
export function detectMixedOutcomes(
  outcomes: HypothesisOutcome[],
  codes: Set<string>
): Array<{ code: string; specialCount: number; normalCount: number }> {
  const result: Array<{ code: string; specialCount: number; normalCount: number }> = [];
  for (const code of codes) {
    const forCode = outcomes.filter(o => o.code === code);
    const specialCount = forCode.filter(isSpecialSituationOutcome).length;
    const normalCount = forCode.filter(o => !isSpecialSituationOutcome(o)).length;
    if (specialCount > 0 && normalCount > 0) {
      result.push({ code, specialCount, normalCount });
    }
  }
  return result;
}
