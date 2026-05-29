import type { Candidate, HypeRisk, MarketContext } from "../types.js";

const HYPE_TAGS = new Set([
  "ai",
  "生成ai",
  "semiconductor",
  "crypto",
  "web3",
  "space",
  "robotics",
  "quantum",
  "nuclear",
  "defense",
  "ipo",
]);

export function buildHypeRisk(candidate: Candidate, marketContext?: MarketContext): HypeRisk {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const matchedTags = candidate.tags.filter(tag => HYPE_TAGS.has(tag.toLowerCase()));
  if (matchedTags.length > 0) {
    score += Math.min(30, matchedTags.length * 10);
    reasons.push(`流行テーマタグ: ${matchedTags.join(", ")}`);
  }

  if (candidate.rules.includes("ipo_selling_pressure_done")) {
    score += 20;
    reasons.push("IPO関連は需給とSNS熱狂の影響を受けやすい");
  }

  if (marketContext?.return5d != null && marketContext.return5d >= 20) {
    score += 25;
    reasons.push(`5日リターン +${marketContext.return5d.toFixed(1)}% と短期急騰`);
  } else if (marketContext?.return5d != null && marketContext.return5d >= 10) {
    score += 15;
    reasons.push(`5日リターン +${marketContext.return5d.toFixed(1)}% と短期上昇`);
  }

  if (marketContext?.return20d != null && marketContext.return20d >= 40) {
    score += 25;
    reasons.push(`20日リターン +${marketContext.return20d.toFixed(1)}% と過熱気味`);
  } else if (marketContext?.return20d != null && marketContext.return20d >= 20) {
    score += 15;
    reasons.push(`20日リターン +${marketContext.return20d.toFixed(1)}% と強い上昇`);
  }

  if (marketContext?.volatility20d != null && marketContext.volatility20d >= 6) {
    score += 15;
    reasons.push(`20日ボラティリティ ${marketContext.volatility20d.toFixed(1)}% と荒い`);
  }

  const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  if (level === "high") {
    warnings.push("SNS・流行・短期急騰によるFOMOリスクが高いです。即断せず一次情報とバリュエーションを確認してください");
  } else if (level === "medium") {
    warnings.push("流行テーマまたは短期上昇があり、過熱していないか確認してください");
  }

  return {
    score: Math.min(score, 100),
    level,
    reasons,
    warnings,
  };
}
