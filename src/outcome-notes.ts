import { todayJst } from "./date.js";
import type { HypothesisOutcome, HypothesisResult, StockCandidateHypothesis } from "./universe.js";

export type OutcomeReturnDataForNotes = {
  ret1m: number | null;
  maxDrawdownPct: number | null;
  dataAvailability: "ok" | "partial" | "missing";
};

function resolveActualDirection(ret1m: number | null): "up" | "down" | "sideways" | "unknown" {
  if (ret1m == null) return "unknown";
  if (ret1m >= 3) return "up";
  if (ret1m <= -3) return "down";
  return "sideways";
}

export function buildOutcomeNotes(input: {
  hypothesis: StockCandidateHypothesis;
  returns: OutcomeReturnDataForNotes;
  relativeToTopix1m: number | null;
  result: HypothesisResult;
  dataSource: "jquants" | "mock";
}): Pick<HypothesisOutcome, "whatMatched" | "whatDiffered" | "missedSignals" | "improvedRuleIdeas" | "notes"> {
  if (input.dataSource === "mock") {
    return {
      whatMatched: [],
      whatDiffered: [],
      missedSignals: ["J-Quants未設定のため価格・TOPIX比を未評価"],
      improvedRuleIdeas: ["実データ取得後に同じ仮説を再レビューする"],
      notes: "未評価: J-Quants未設定のためリターン未計算",
    };
  }

  const whatMatched: string[] = [];
  const whatDiffered: string[] = [];
  const missedSignals: string[] = [];
  const improvedRuleIdeas: string[] = [];
  const direction = resolveActualDirection(input.returns.ret1m);
  const canCompareDirection =
    input.returns.dataAvailability === "ok" &&
    input.hypothesis.expectedDirection !== "unknown" &&
    direction !== "unknown";

  if (canCompareDirection && input.hypothesis.expectedDirection === direction) {
    whatMatched.push(`期待方向 ${input.hypothesis.expectedDirection} と1か月方向が一致`);
  } else if (canCompareDirection) {
    whatDiffered.push(`期待方向 ${input.hypothesis.expectedDirection} に対して実績は ${direction}`);
  }

  if (input.returns.dataAvailability === "ok" && input.relativeToTopix1m != null) {
    if (input.relativeToTopix1m >= 0) whatMatched.push(`TOPIX比で+${input.relativeToTopix1m.toFixed(1)}%`);
    else whatDiffered.push(`TOPIX比で${input.relativeToTopix1m.toFixed(1)}%`);
  }

  if (input.returns.maxDrawdownPct != null && input.returns.maxDrawdownPct <= -10) {
    missedSignals.push(`検証期間中の最大下落が${input.returns.maxDrawdownPct.toFixed(1)}%`);
    improvedRuleIdeas.push("仮説保存時に最大許容下落と撤退確認ラインを明示する");
  }
  if (input.result === "miss") improvedRuleIdeas.push("反証条件・一次情報・決算前後イベントを追加確認する");
  if (input.returns.dataAvailability !== "ok") {
    missedSignals.push(`未評価: 価格データ不足 (${input.returns.dataAvailability})`);
    improvedRuleIdeas.push("データ取得期間または市場コードの妥当性を確認する");
  }

  const availabilityNote = input.returns.dataAvailability === "ok"
    ? ""
    : ` / 未評価: 価格データ不足 (${input.returns.dataAvailability})`;
  return {
    whatMatched,
    whatDiffered,
    missedSignals,
    improvedRuleIdeas: [...new Set(improvedRuleIdeas)],
    notes: `${todayJst()}時点で評価。1m=${input.returns.ret1m?.toFixed(1) ?? "N/A"}%, TOPIX比=${input.relativeToTopix1m?.toFixed(1) ?? "N/A"}%${availabilityNote}`,
  };
}
