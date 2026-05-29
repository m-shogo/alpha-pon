import type { PullbackInput } from "../types.js";

export type PullbackScoreDetail = {
  score: number;
  reasons: string[];
  negativeReasons: string[];
  nextSteps: string[];
};

export function scoreHealthyPullback(input: PullbackInput): PullbackScoreDetail {
  let score = 0;
  const reasons: string[] = [];
  const negativeReasons: string[] = [];

  if (input.drawdownPct <= -25) {
    score += 10;
    reasons.push(`高値から${Math.abs(input.drawdownPct).toFixed(1)}%下落（深い押し目）`);
  } else if (input.drawdownPct <= -15) {
    score += 6;
    reasons.push(`高値から${Math.abs(input.drawdownPct).toFixed(1)}%下落`);
  }

  if (input.revenueYoY >= 0) {
    score += 4;
    reasons.push(`売上前年比 +${input.revenueYoY.toFixed(1)}%（成長継続）`);
  } else {
    negativeReasons.push(`売上前年比 ${input.revenueYoY.toFixed(1)}%`);
  }

  if (input.operatingProfitYoY >= -10) {
    score += 4;
    reasons.push(`営業利益前年比 ${input.operatingProfitYoY >= 0 ? "+" : ""}${input.operatingProfitYoY.toFixed(1)}%（大崩れなし）`);
  } else {
    negativeReasons.push(`営業利益前年比 ${input.operatingProfitYoY.toFixed(1)}%（業績悪化懸念）`);
  }

  if (!input.hasDownwardRevision) {
    score += 5;
    reasons.push("下方修正なし");
  } else {
    negativeReasons.push("下方修正あり");
  }

  if (input.hasStrategicTheme) {
    score += 5;
    reasons.push("長期テーマ・業界ポジション維持");
  }

  const nextSteps = [
    "直近決算短信の確認",
    "下落要因の特定（市場全体 vs 個社要因）",
    "類似調整局面の過去事例確認",
    "有価証券報告書のリスク欄確認",
  ];

  return { score: Math.min(score, 25), reasons, negativeReasons, nextSteps };
}
