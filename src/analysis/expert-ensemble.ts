import type {
  Candidate,
  DataQuality,
  ExpertEnsembleReview,
  ExpertLensKey,
  ExpertLensResult,
  ExpertVerdict,
  FinancialQuality,
  HypeRisk,
  MarketContext,
  RiskReview,
} from "../types.js";

type ExpertInput = {
  candidate: Candidate;
  score: number;
  dataQuality: DataQuality;
  reasons: string[];
  negativeReasons: string[];
  warnings: string[];
  marketContext?: MarketContext;
  financialQuality?: FinancialQuality;
  hypeRisk?: HypeRisk;
  riskReview?: RiskReview;
};

function lens(
  key: ExpertLensKey,
  name: string,
  verdict: ExpertVerdict,
  confidence: number,
  reasons: string[],
  objections: string[],
  nextChecks: string[]
): ExpertLensResult {
  return { key, name, verdict, confidence, reasons, objections, nextChecks };
}

function verdict(good: number, bad: number, hardBlock = false): ExpertVerdict {
  if (hardBlock || bad >= 2) return "block";
  if (bad === 1) return "caution";
  if (good >= 3) return "strong";
  if (good >= 1) return "pass";
  return "caution";
}

function qualityValueLens(input: ExpertInput): ExpertLensResult {
  const f = input.financialQuality;
  const reasons: string[] = [];
  const objections: string[] = [];

  if ((f?.qualityScore ?? 0) >= 7) reasons.push("財務品質スコアが高い");
  if ((f?.operatingMargin ?? -999) >= 10) reasons.push("営業利益率が二桁以上");
  if (f?.hasDownwardRevision === false) reasons.push("下方修正は検出されていない");

  if (!f) objections.push("財務品質データがない");
  if ((f?.qualityScore ?? 0) < 5) objections.push("財務品質スコアが低い");
  if ((f?.operatingMargin ?? -999) < 5) objections.push("営業利益率が低い、または不明");
  if (f?.hasDownwardRevision !== false) objections.push("下方修正有無に懸念");

  return lens(
    "quality_value",
    "品質・バリュー視点",
    verdict(reasons.length, objections.length),
    f ? 0.75 : 0.35,
    reasons,
    objections,
    ["事業内容と収益源を確認", "競争優位が持続するか確認", "割高すぎないか確認"]
  );
}

function growthCompounderLens(input: ExpertInput): ExpertLensResult {
  const f = input.financialQuality;
  const reasons: string[] = [];
  const objections: string[] = [];

  if ((f?.revenueYoY ?? -999) >= 10) reasons.push("売上成長が二桁以上");
  if ((f?.operatingProfitYoY ?? -999) >= 15) reasons.push("営業利益成長が強い");
  if ((f?.operatingMarginYoY ?? -999) >= 1) reasons.push("営業利益率が改善");

  if ((f?.revenueYoY ?? -999) < 0) objections.push("売上が減少");
  if ((f?.operatingProfitYoY ?? -999) < -10) objections.push("営業利益が大きく悪化");
  if ((f?.operatingMarginYoY ?? 0) <= -3) objections.push("利益率が大きく悪化");

  return lens(
    "growth_compounder",
    "成長株視点",
    verdict(reasons.length, objections.length),
    f ? 0.7 : 0.3,
    reasons,
    objections,
    ["成長が一過性ではないか確認", "セグメント別の成長源を確認", "通期予想の進捗を確認"]
  );
}

function quantEvidenceLens(input: ExpertInput): ExpertLensResult {
  const m = input.marketContext;
  const reasons: string[] = [];
  const objections: string[] = [];

  if (input.score >= 85) reasons.push("総合スコアが高い");
  if ((m?.relativeToTopix20d ?? -999) >= 5) reasons.push("ベンチマーク比20日で強い");
  if ((m?.return20d ?? -999) > -10 && (m?.return20d ?? 999) < 25) reasons.push("20日リターンが極端ではない");

  if (input.score < 70) objections.push("通知候補としてはスコア不足");
  if (m?.relativeToTopix20d == null) objections.push("ベンチマーク比較が不足");
  if ((m?.return5d ?? 0) >= 20) objections.push("短期急騰後でタイミングが遅い可能性");

  return lens(
    "quant_evidence",
    "クオンツ検証視点",
    verdict(reasons.length, objections.length),
    m ? 0.7 : 0.4,
    reasons,
    objections,
    ["スコア帯別の過去成績を確認", "ルール別バックテストを見る", "サンプル数が十分か確認"]
  );
}

function riskManagerLens(input: ExpertInput): ExpertLensResult {
  const m = input.marketContext;
  const reasons: string[] = [];
  const objections: string[] = [];

  if (input.dataQuality === "ok") reasons.push("データ品質はok");
  if ((m?.liquidityYen20d ?? 0) >= 100_000_000) reasons.push("20日平均売買代金が最低ライン以上");
  if ((m?.volatility20d ?? 999) <= 5) reasons.push("20日ボラティリティが許容範囲");

  if (input.dataQuality !== "ok") objections.push(`データ品質が${input.dataQuality}`);
  if ((m?.liquidityYen20d ?? 0) < 100_000_000) objections.push("流動性が不足または不明");
  if ((m?.volatility20d ?? 999) > 5) objections.push("値動きが荒い");
  if (input.hypeRisk?.level === "high") objections.push("過熱リスクが高い");

  return lens(
    "risk_manager",
    "リスク管理視点",
    verdict(reasons.length, objections.length, objections.length >= 2),
    0.85,
    reasons,
    objections,
    ["流動性を確認", "値動きの荒さを確認", "データ欠損がないか確認"]
  );
}

function eventSpecialistLens(input: ExpertInput): ExpertLensResult {
  const reasons: string[] = [];
  const objections: string[] = [];
  const hasEventRule = input.candidate.rules.some(rule => ["structural_event", "earnings_drop"].includes(rule));

  if (hasEventRule) reasons.push("イベント系ルールに該当");
  if (input.candidate.rules.includes("structural_event")) reasons.push("構造イベント候補");
  if (input.candidate.rules.includes("earnings_drop")) reasons.push("決算イベント候補");

  if (!hasEventRule) objections.push("明確なイベント材料が少ない");
  if (input.warnings.some(w => w.includes("決算開示日") || w.includes("特定できません"))) {
    objections.push("イベント日付の特定に懸念");
  }

  return lens(
    "event_specialist",
    "イベント投資視点",
    verdict(reasons.length, objections.length),
    hasEventRule ? 0.65 : 0.35,
    reasons,
    objections,
    ["開示本文を確認", "材料が一過性か継続性ありか確認", "悪材料イベントではないか確認"]
  );
}

function ipoSupplyLens(input: ExpertInput): ExpertLensResult {
  const reasons: string[] = [];
  const objections: string[] = [];
  const isIpo = input.candidate.rules.includes("ipo_selling_pressure_done") || input.candidate.tags.includes("ipo");

  if (isIpo) reasons.push("IPO/需給ルールに該当");
  if (input.candidate.listedAt) reasons.push("上場日が設定済み");
  if (input.reasons.some(r => r.includes("売り圧力") || r.includes("安値"))) reasons.push("需給改善の兆候あり");

  if (isIpo && !input.candidate.listedAt) objections.push("IPO判定に必要な上場日が未設定");
  if (isIpo && input.hypeRisk?.level !== "low") objections.push("IPO/テーマ由来の過熱確認が必要");

  return lens(
    "ipo_supply",
    "IPO・需給視点",
    verdict(reasons.length, objections.length),
    isIpo ? 0.7 : 0.3,
    reasons,
    objections,
    ["公募価格・初値・ロックアップを確認", "初値天井リスクを確認", "出来高減少と安値更新停止を確認"]
  );
}

function trendContrarianLens(input: ExpertInput): ExpertLensResult {
  const m = input.marketContext;
  const reasons: string[] = [];
  const objections: string[] = [];

  if ((m?.return20d ?? 0) <= -15 && (m?.relativeToTopix20d ?? -999) >= 0) reasons.push("下落しているが市場対比では弱くない");
  if (input.candidate.rules.includes("healthy_pullback")) reasons.push("押し目候補ルールに該当");
  if ((m?.return5d ?? 0) < 10) reasons.push("短期急騰後ではない");

  if ((m?.return5d ?? 0) >= 20) objections.push("短期急騰後で追いかけリスク");
  if ((m?.relativeToTopix20d ?? 0) <= -10) objections.push("市場対比で大きく弱い");
  if (input.hypeRisk?.level === "high") objections.push("流行過熱で逆張りになっていない可能性");

  return lens(
    "trend_contrarian",
    "トレンド/逆張り視点",
    verdict(reasons.length, objections.length),
    m ? 0.65 : 0.35,
    reasons,
    objections,
    ["下落理由が一時的か確認", "高値掴みになっていないか確認", "市場全体の地合いを確認"]
  );
}

function dataEngineerLens(input: ExpertInput): ExpertLensResult {
  const reasons: string[] = [];
  const objections: string[] = [];

  if (input.dataQuality === "ok") reasons.push("データ品質がok");
  if (input.marketContext) reasons.push("市場文脈データあり");
  if (input.financialQuality) reasons.push("財務品質データあり");

  if (input.dataQuality !== "ok") objections.push(`dataQuality=${input.dataQuality}`);
  if (!input.marketContext) objections.push("市場文脈データなし");
  if (!input.financialQuality) objections.push("財務品質データなし");
  if (input.warnings.some(w => w.includes("取得失敗") || w.includes("未設定"))) objections.push("取得失敗または設定不足あり");

  return lens(
    "data_engineer",
    "データ品質視点",
    verdict(reasons.length, objections.length, objections.length >= 1),
    0.9,
    reasons,
    objections,
    ["欠損データを確認", "ベンチマークコードを確認", "J-Quants設定を確認"]
  );
}

function weightedScore(verdict: ExpertVerdict, confidence: number): number {
  const base = verdict === "strong" ? 100 : verdict === "pass" ? 75 : verdict === "caution" ? 45 : 0;
  return base * confidence;
}

export function buildExpertEnsembleReview(input: ExpertInput): ExpertEnsembleReview {
  const lenses = [
    qualityValueLens(input),
    growthCompounderLens(input),
    quantEvidenceLens(input),
    riskManagerLens(input),
    eventSpecialistLens(input),
    ipoSupplyLens(input),
    trendContrarianLens(input),
    dataEngineerLens(input),
  ];

  const blockCount = lenses.filter(l => l.verdict === "block").length;
  const cautionCount = lenses.filter(l => l.verdict === "caution").length;
  const passCount = lenses.filter(l => l.verdict === "pass").length;
  const strongCount = lenses.filter(l => l.verdict === "strong").length;
  const confidenceSum = lenses.reduce((sum, l) => sum + l.confidence, 0) || 1;
  const consensusScore = lenses.reduce((sum, l) => sum + weightedScore(l.verdict, l.confidence), 0) / confidenceSum;

  const finalVerdict: ExpertVerdict = blockCount > 0
    ? "block"
    : consensusScore >= 80 && cautionCount <= 1
      ? "strong"
      : consensusScore >= 60
        ? "pass"
        : "caution";

  const disagreements = lenses
    .filter(l => l.verdict === "block" || l.verdict === "caution")
    .flatMap(l => l.objections.map(o => `${l.name}: ${o}`));

  const requiredBeforeNotification = finalVerdict === "block"
    ? disagreements.slice(0, 8)
    : disagreements.slice(0, 4);

  return {
    finalVerdict,
    consensusScore: Math.round(consensusScore),
    passCount,
    cautionCount,
    blockCount,
    strongCount,
    lenses,
    disagreements,
    requiredBeforeNotification,
  };
}
