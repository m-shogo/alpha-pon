import type { AccuracySummary, HypothesisOutcome, WorldContext } from "./universe.js";
import type { BuffettQualitySnapshot, IrEventEvidence, ValuationSnapshot } from "./pro-types.js";
import type { LegendAgentVerdict, ProLegendAgentId } from "./legend-pro-types.js";

type CompanyInput = {
  code: string;
  name: string;
  noMoveHypothesis?: string;
  downsideHypothesis?: string;
  evidenceToCheck?: string[];
  nonMoveReasonCandidates?: string[];
  role?: string;
};

type NetworkInput = {
  peers?: Array<{ code: string; name: string; relation: string }>;
  betterPeerRisk?: string[];
  evidenceChecks?: string[];
  customerOrDemandDrivers?: string[];
};

export type LegendAgentInput = {
  company: CompanyInput;
  network?: NetworkInput;
  irEvents?: IrEventEvidence[];
  buffettQuality?: BuffettQualitySnapshot;
  valuation?: ValuationSnapshot;
  outcomes?: HypothesisOutcome[];
  accuracySummary?: AccuracySummary | null;
  worldContext?: WorldContext | null;
};

const AGENT_LABELS: Record<ProLegendAgentId, string> = {
  munger_bias_agent: "マンガー型: 反転思考・心理バイアス",
  marks_cycle_agent: "ハワード・マークス型: サイクルと市場心理",
  soros_reflexivity_agent: "ソロス型: 反射性・自己強化",
  druckenmiller_asymmetry_agent: "ドラッケンミラー型: マクロ×非対称",
  lynch_story_agent: "ピーター・リンチ型: 成長ストーリー検証",
  klarman_margin_agent: "セス・クラーマン型: 安全域",
  greenblatt_quality_value_agent: "グリーンブラット型: 品質×割安",
  simons_statistical_edge_agent: "シモンズ型: 統計的再現性",
  dalio_regime_agent: "ダリオ型: レジーム・相関",
  thorp_risk_of_ruin_agent: "ソープ型: 期待値と破滅回避",
};

function verdict(params: {
  agentId: ProLegendAgentId;
  stance: LegendAgentVerdict["stance"];
  confidence: number;
  positiveEvidence?: string[];
  negativeEvidence?: string[];
  missingEvidence?: string[];
  blockerReasons?: string[];
}): LegendAgentVerdict {
  return {
    agentId: params.agentId,
    label: AGENT_LABELS[params.agentId],
    stance: params.stance,
    confidence: params.confidence,
    positiveEvidence: params.positiveEvidence ?? [],
    negativeEvidence: params.negativeEvidence ?? [],
    missingEvidence: params.missingEvidence ?? [],
    blockerReasons: params.blockerReasons ?? [],
  };
}

function textOf(input: LegendAgentInput): string {
  return [
    input.company.name,
    input.company.role,
    input.company.noMoveHypothesis,
    input.company.downsideHypothesis,
    ...(input.company.evidenceToCheck ?? []),
    ...(input.company.nonMoveReasonCandidates ?? []),
    ...(input.valuation?.valuationRisks ?? []),
    ...(input.buffettQuality?.moatEvidence ?? []),
    ...(input.buffettQuality?.missingData ?? []),
  ].filter(Boolean).join(" ");
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function mungerBias(input: LegendAgentInput): LegendAgentVerdict {
  const text = textOf(input);
  const negatives: string[] = [];
  if (hasAny(text, [/FOMO/i, /高値追い|急騰|過熱|期待先行/])) negatives.push("FOMO・高値追い・期待先行の可能性");
  if (hasAny(text, [/ブランド|IP|サンリオ|任天堂/]) && !input.company.downsideHypothesis) negatives.push("ブランド好みで弱気シナリオが薄い可能性");
  if (!input.company.noMoveHypothesis) negatives.push("上がらない理由が未整理");
  if (!input.company.downsideHypothesis) negatives.push("下がる理由が未整理");
  return verdict({
    agentId: "munger_bias_agent",
    stance: negatives.length >= 2 ? "証拠不足" : negatives.length === 1 ? "保留" : "調査候補",
    confidence: negatives.length >= 2 ? 0.4 : 0.65,
    positiveEvidence: negatives.length === 0 ? ["反転思考の最低条件は概ねあり"] : [],
    negativeEvidence: negatives,
    missingEvidence: negatives.filter(v => /未整理|薄い/.test(v)),
    blockerReasons: negatives.length >= 2 ? negatives : [],
  });
}

function marksCycle(input: LegendAgentInput): LegendAgentVerdict {
  const context = input.worldContext;
  const regimes = context?.activeRegimes ?? [];
  const evidence = regimes.map(regime => `${regime.id}: ${regime.level}`);
  const warningText = regimes.flatMap(regime => regime.caution ?? []).join(" ");
  const overheated = /過熱|euphoria|risk_on|AI|IPO|半導体|テーマ/.test(warningText + " " + textOf(input));
  return verdict({
    agentId: "marks_cycle_agent",
    stance: !context ? "証拠不足" : overheated ? "保留" : "調査候補",
    confidence: context ? 0.6 : 0.3,
    positiveEvidence: evidence.slice(0, 4),
    negativeEvidence: overheated ? ["市場心理・テーマ過熱を優先確認"] : [],
    missingEvidence: context ? [] : ["current-regime / worldContext が未取得"],
  });
}

function sorosReflexivity(input: LegendAgentInput): LegendAgentVerdict {
  const valuation = input.valuation;
  const risks = valuation?.valuationRisks ?? [];
  const bubbleLike = risks.some(risk => /過熱|市場比|出来高|期待先行|急騰/.test(risk));
  return verdict({
    agentId: "soros_reflexivity_agent",
    stance: !valuation ? "証拠不足" : bubbleLike ? "保留" : "調査候補",
    confidence: valuation ? 0.58 : 0.3,
    positiveEvidence: valuation && !bubbleLike ? ["反射性バブルの明確な警告は未検出"] : [],
    negativeEvidence: bubbleLike ? risks.slice(0, 5) : [],
    missingEvidence: valuation ? [] : ["valuation_snapshot が未生成"],
  });
}

function druckenmillerAsymmetry(input: LegendAgentInput): LegendAgentVerdict {
  const hasDownside = Boolean(input.company.downsideHypothesis);
  const hasMacro = Boolean(input.worldContext && input.worldContext.activeRegimes.length > 0);
  const positives = hasMacro ? ["世界レジームとの接続を確認可能"] : [];
  const missing = [!hasDownside ? "下落シナリオが不足" : null, !hasMacro ? "マクロ整合性が未確認" : null].filter((v): v is string => Boolean(v));
  return verdict({
    agentId: "druckenmiller_asymmetry_agent",
    stance: missing.length > 0 ? "証拠不足" : "保留",
    confidence: missing.length > 0 ? 0.35 : 0.58,
    positiveEvidence: positives,
    missingEvidence: missing,
    negativeEvidence: missing,
  });
}

function lynchStory(input: LegendAgentInput): LegendAgentVerdict {
  const text = textOf(input);
  const hasStory = hasAny(text, [/売上|成長|海外|店舗|ユーザー|需要|顧客|ライセンス|セグメント/]);
  const hasProfit = hasAny(text, [/利益|営業利益|利益率|FCF|ROIC/]);
  const missing = [!hasStory ? "成長ストーリーが未整理" : null, !hasProfit ? "成長が利益に接続する証拠が不足" : null].filter((v): v is string => Boolean(v));
  return verdict({
    agentId: "lynch_story_agent",
    stance: missing.length >= 2 ? "証拠不足" : missing.length === 1 ? "保留" : "調査候補",
    confidence: missing.length === 0 ? 0.68 : 0.42,
    positiveEvidence: missing.length === 0 ? ["成長ストーリーと利益接続の確認対象あり"] : [],
    missingEvidence: missing,
    negativeEvidence: missing,
  });
}

function klarmanMargin(input: LegendAgentInput): LegendAgentVerdict {
  const valuation = input.valuation;
  const missing = [] as string[];
  if (!valuation) missing.push("valuation_snapshot が未生成");
  if (!input.company.downsideHypothesis) missing.push("下値シナリオが不足");
  if (!input.irEvents || input.irEvents.length === 0) missing.push("カタリスト候補となるIRイベントが不足");
  const risks = valuation?.valuationRisks ?? [];
  return verdict({
    agentId: "klarman_margin_agent",
    stance: missing.length > 0 ? "証拠不足" : risks.length > 0 ? "保留" : "調査候補",
    confidence: missing.length > 0 ? 0.35 : 0.62,
    positiveEvidence: missing.length === 0 ? ["安全域確認の最低材料あり"] : [],
    negativeEvidence: risks.slice(0, 4),
    missingEvidence: missing,
    blockerReasons: missing.length >= 2 ? missing : [],
  });
}

function greenblattQualityValue(input: LegendAgentInput): LegendAgentVerdict {
  const quality = input.buffettQuality;
  const valuation = input.valuation;
  const missing = [!quality ? "buffett_quality が未生成" : null, !valuation ? "valuation_snapshot が未生成" : null].filter((v): v is string => Boolean(v));
  const qualityOk = quality?.qualityLabel === "compounder" || quality?.qualityLabel === "good_business";
  const valueUnknown = valuation?.growthAdjustedValuation === "unknown";
  return verdict({
    agentId: "greenblatt_quality_value_agent",
    stance: missing.length > 0 || valueUnknown ? "証拠不足" : qualityOk ? "保留" : "証拠不足",
    confidence: missing.length > 0 ? 0.3 : 0.55,
    positiveEvidence: qualityOk ? [`品質ラベル: ${quality?.qualityLabel}`] : [],
    negativeEvidence: valueUnknown ? ["割安性が未判定"] : [],
    missingEvidence: [...missing, ...(valueUnknown ? ["PER/PBR過去レンジ・同業比較が未取得"] : [])],
  });
}

function simonsStatisticalEdge(input: LegendAgentInput): LegendAgentVerdict {
  const total = input.accuracySummary?.total ?? 0;
  const hitRate = input.accuracySummary?.hitRate ?? null;
  const outcomes = input.outcomes ?? [];
  const missing = total < 20 ? [`検証サンプルが少ない: n=${total}`] : [];
  const negative = hitRate != null && hitRate < 0.5 ? [`hitRate が低い: ${(hitRate * 100).toFixed(0)}%`] : [];
  return verdict({
    agentId: "simons_statistical_edge_agent",
    stance: missing.length > 0 ? "証拠不足" : negative.length > 0 ? "保留" : "調査候補",
    confidence: total >= 50 ? 0.7 : total >= 20 ? 0.55 : 0.25,
    positiveEvidence: total >= 20 ? [`検証サンプル n=${total}`, `outcomes=${outcomes.length}`] : [],
    negativeEvidence: negative,
    missingEvidence: missing,
    blockerReasons: missing,
  });
}

function dalioRegime(input: LegendAgentInput): LegendAgentVerdict {
  const context = input.worldContext;
  const text = textOf(input);
  const macroSensitive = hasAny(text, [/金利|為替|円安|インフレ|景気|市況|半導体|素材|銀行|防衛/]);
  const missing = !context ? ["worldContext が未取得"] : [];
  const negative = macroSensitive ? ["マクロ感応度が高く、金利・為替・景気レジーム確認が必要"] : [];
  return verdict({
    agentId: "dalio_regime_agent",
    stance: missing.length > 0 ? "証拠不足" : macroSensitive ? "保留" : "調査候補",
    confidence: context ? 0.58 : 0.3,
    positiveEvidence: context ? (context.activeRegimes ?? []).slice(0, 3).map(r => `${r.id}: ${r.level}`) : [],
    negativeEvidence: negative,
    missingEvidence: missing,
  });
}

function thorpRisk(input: LegendAgentInput): LegendAgentVerdict {
  const outcomes = input.outcomes ?? [];
  const drawdowns = outcomes.map(o => o.maxDrawdownPct).filter((v): v is number => typeof v === "number");
  const worst = drawdowns.length > 0 ? Math.min(...drawdowns) : null;
  const missing = outcomes.length < 20 ? [`検証件数が不足: n=${outcomes.length}`] : [];
  const negative = worst != null && worst <= -15 ? [`過去検証の最大下落が大きい: ${worst.toFixed(1)}%`] : [];
  return verdict({
    agentId: "thorp_risk_of_ruin_agent",
    stance: missing.length > 0 ? "証拠不足" : negative.length > 0 ? "保留" : "調査候補",
    confidence: outcomes.length >= 50 ? 0.68 : outcomes.length >= 20 ? 0.52 : 0.25,
    positiveEvidence: outcomes.length >= 20 ? [`検証件数 n=${outcomes.length}`] : [],
    negativeEvidence: negative,
    missingEvidence: missing,
    blockerReasons: missing,
  });
}

export function buildLegendAgentVerdicts(input: LegendAgentInput): LegendAgentVerdict[] {
  return [
    mungerBias(input),
    marksCycle(input),
    sorosReflexivity(input),
    druckenmillerAsymmetry(input),
    lynchStory(input),
    klarmanMargin(input),
    greenblattQualityValue(input),
    simonsStatisticalEdge(input),
    dalioRegime(input),
    thorpRisk(input),
  ];
}

export function summarizeLegendWarnings(verdicts: LegendAgentVerdict[]): string[] {
  return [...new Set(verdicts.flatMap(v => [...v.negativeEvidence, ...v.missingEvidence, ...v.blockerReasons]))].slice(0, 12);
}
