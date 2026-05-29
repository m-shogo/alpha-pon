import type {
  Candidate,
  DataQuality,
  FinancialQuality,
  HypeRisk,
  MarketContext,
  RiskReview,
} from "../types.js";

const KNOWN_DOMAIN_TAGS = new Set([
  "semiconductor",
  "software",
  "ai",
  "infrastructure",
  "finance",
  "consumer",
  "manufacturing",
  "space",
  "defense",
  "robotics",
]);

export function buildResearchReview(input: {
  candidate: Candidate;
  dataQuality: DataQuality;
  score: number;
  marketContext?: MarketContext;
  financialQuality?: FinancialQuality;
  hypeRisk?: HypeRisk;
  warnings: string[];
  negativeReasons: string[];
}): RiskReview {
  const blockers: string[] = [];
  const reviewWarnings: string[] = [];
  const strengths: string[] = [];

  const circleOfCompetence = input.candidate.tags.some(tag => KNOWN_DOMAIN_TAGS.has(tag.toLowerCase()));
  const businessQuality = (input.financialQuality?.qualityScore ?? 0) >= 6;
  const financialSafety =
    input.financialQuality?.hasDownwardRevision === false &&
    (input.financialQuality?.operatingMargin ?? -999) >= 5;
  const marketRelativeStrength =
    input.marketContext?.relativeToTopix20d != null &&
    input.marketContext.relativeToTopix20d >= 0;
  const liquidityOk =
    input.marketContext?.liquidityYen20d != null &&
    input.marketContext.liquidityYen20d >= 100_000_000;
  const volatilityOk =
    input.marketContext?.volatility20d != null &&
    input.marketContext.volatility20d <= 5;
  const noDownwardRevision = input.financialQuality?.hasDownwardRevision === false;
  const noFomo = input.hypeRisk?.level !== "high";
  const enoughData = input.dataQuality === "ok";

  if (circleOfCompetence) {
    strengths.push("理解可能なテーマ/事業領域タグあり");
  } else {
    reviewWarnings.push("事業内容・収益源・競争優位の確認が必要です");
  }

  if (businessQuality) {
    strengths.push("財務品質スコアが一定以上");
  } else {
    reviewWarnings.push("財務品質スコアが十分ではありません");
  }

  if (financialSafety) {
    strengths.push("利益率と下方修正面で大きな警戒なし");
  } else {
    reviewWarnings.push("利益率または下方修正面に注意が必要です");
  }

  if (marketRelativeStrength) {
    strengths.push("市場対比で相対的に弱くない");
  } else {
    reviewWarnings.push("市場対比で弱い、または比較データが不足しています");
  }

  if (!liquidityOk) {
    blockers.push("流動性または売買代金データに注意が必要です");
  }

  if (!volatilityOk) {
    reviewWarnings.push("値動きが荒い、またはボラティリティデータが不足しています");
  }

  if (!noDownwardRevision) {
    blockers.push("下方修正あり、または下方修正有無が不明です");
  }

  if (!noFomo) {
    blockers.push("流行・短期急騰による過熱リスクが高いです");
  }

  if (!enoughData) {
    blockers.push(`データ品質が ${input.dataQuality} です`);
  }

  for (const warning of input.warnings) {
    if (
      warning.includes("取得失敗") ||
      warning.includes("未設定") ||
      warning.includes("不足") ||
      warning.includes("特定できません")
    ) {
      blockers.push(warning);
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set([...reviewWarnings, ...input.negativeReasons])];
  const uniqueStrengths = [...new Set(strengths)];

  const decision = uniqueBlockers.length > 0
    ? "reject"
    : input.score >= 85 && uniqueWarnings.length <= 2
      ? "high_quality_candidate"
      : input.score >= 70
        ? "watch"
        : "research_only";

  return {
    decision,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    strengths: uniqueStrengths,
    checklist: {
      circleOfCompetence,
      businessQuality,
      financialSafety,
      marketRelativeStrength,
      liquidityOk,
      volatilityOk,
      noDownwardRevision,
      noFomo,
      enoughData,
    },
  };
}
