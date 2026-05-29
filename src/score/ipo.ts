import type { IpoPressureInput } from "../types.js";

export type IpoScoreDetail = {
  score: number;
  reasons: string[];
  nextSteps: string[];
};

export function scoreIpoSellingPressure(input: IpoPressureInput): IpoScoreDetail {
  let score = 0;
  const reasons: string[] = [];

  if (input.daysSinceListing >= 60) {
    score += 8;
    reasons.push(`上場から${input.daysSinceListing}日経過`);
  }
  if (input.volumeRatioToFirstDay <= 0.25) {
    score += 8;
    reasons.push(`出来高が上場初日の${Math.round(input.volumeRatioToFirstDay * 100)}%以下（需給冷却）`);
  }
  if (input.noNewLowDays >= 10) {
    score += 6;
    reasons.push(`直近${input.noNewLowDays}日で安値更新なし`);
  }
  if (input.recoveredMa20) {
    score += 3;
    reasons.push("20日移動平均を回復");
  }
  if (input.lockupPassed) {
    score += 3;
    reasons.push("ロックアップ解除済み");
  }

  const nextSteps = [
    "ロックアップ解除日の最終確認",
    "大株主構成（有価証券報告書）",
    "直近の出来高推移（TradingView）",
    "IPO時の公開価格との比較",
  ];

  return { score: Math.min(score, 25), reasons, nextSteps };
}
