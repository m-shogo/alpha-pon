import type { EarningsDropInput } from "../types.js";

export type EarningsDropScoreDetail = {
  score: number;
  reasons: string[];
  negativeReasons: string[];
  nextSteps: string[];
};

export function scoreEarningsDrop(input: EarningsDropInput): EarningsDropScoreDetail {
  let score = 0;
  const reasons: string[] = [];
  const negativeReasons: string[] = [];

  if (input.nextDayChangePct == null) {
    negativeReasons.push("決算翌日の株価変化データなし");
  } else if (input.nextDayChangePct <= -10) {
    score += 12;
    reasons.push(`決算翌日に${input.nextDayChangePct.toFixed(1)}%急落`);
  } else if (input.nextDayChangePct <= -5) {
    score += 8;
    reasons.push(`決算翌日に${input.nextDayChangePct.toFixed(1)}%下落`);
  }

  if (input.hasDownwardRevision == null) {
    negativeReasons.push("下方修正有無のデータなし");
  } else if (!input.hasDownwardRevision) {
    score += 6;
    reasons.push("下方修正なし");
  } else {
    negativeReasons.push("下方修正あり（業績悪化リスク）");
  }

  if (input.revenueYoY == null) {
    negativeReasons.push("売上前年比データなし");
  } else if (input.revenueYoY >= 0) {
    score += 4;
    reasons.push(`売上前年比 ${input.revenueYoY >= 0 ? "+" : ""}${input.revenueYoY.toFixed(1)}%`);
  } else {
    negativeReasons.push(`売上前年比 ${input.revenueYoY.toFixed(1)}%`);
  }

  if (input.operatingProfitYoY == null) {
    negativeReasons.push("営業利益前年比データなし");
  } else if (input.operatingProfitYoY >= -10) {
    score += 4;
    reasons.push(`営業利益前年比 ${input.operatingProfitYoY >= 0 ? "+" : ""}${input.operatingProfitYoY.toFixed(1)}%`);
  } else {
    negativeReasons.push(`営業利益前年比 ${input.operatingProfitYoY.toFixed(1)}%（大幅悪化）`);
  }

  if (input.hasStrategicTheme) {
    score += 6;
    reasons.push("長期テーマ・戦略的優位性あり");
  }

  const nextSteps = [
    "決算短信の全文確認（セグメント別）",
    "急落要因のアナリストコメント確認",
    "中期経営計画との整合性確認",
    "競合他社の同期間比較",
  ];

  return { score: Math.min(score, 25), reasons, negativeReasons, nextSteps };
}
