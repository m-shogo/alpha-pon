// Research OS — 測定結果から Promotion Gate の裏付けを導出する v1。
//
// 目的:
//   今ある成果物（イベントスタディ・backtest・劣化判定・Holdout 分割・
//   対照群・試行台帳・紙トレード）から、11 の Gate それぞれについて
//   「裏付けがあるか / 無いなら何をすれば埋まるか」を出す。
//
// 既存 promotion.ts との違い:
//   promotion.ts は **Edge YAML の自己申告 pass を検証する**。
//   「pass と書いてあるが証拠があるか」を見る。
//   本モジュールは逆向きで、**測定から裏付けを導出する**。
//   人が YAML に書く前に、何が揃っていて何が足りないかを機械が示す。
//
// 姿勢:
//   **証拠が無ければ supported: false。** 既定で通さない。
//   「まだ測っていない」と「測って問題なかった」を同じ扱いにしない。

import type { AggregateStats } from "../net-alpha.js";
import { GATE_KEYS, type GateKey } from "../types.js";
import type { DecayCheckResult } from "./edge-decay.js";
import type { EventStudyResult } from "./event-study.js";
import type { PaperTradeReconciliation } from "../../execution/paper-trade-ledger.js";

export interface GateEvidenceInput {
  edgeId: string;
  /** Edge が要求するサンプル数。 */
  requiredSamples: number;
  /** 判定に必要な最小クラスタ数。既定 10。 */
  minClusters?: number;
  eventStudy?: EventStudyResult;
  backtest?: {
    net: AggregateStats;
    /** 執行できずに落ちた件数と理由。 */
    skippedReasons: Record<string, number>;
    /** False Discovery Guard の結果。 */
    falseDiscoveryPassed: boolean;
    /** borrow コストを含めて計算したか。 */
    borrowCostIncluded: boolean;
  };
  decay?: DecayCheckResult;
  holdout?: {
    /** 封印期間を除外して検証したか。 */
    partitioned: boolean;
    /** 開封した window。空なら未開封。 */
    openedWindowIds: string[];
    /** 開封に access_log の記録が伴っていたか。 */
    accessRecorded: boolean;
  };
  controls?: { matched: number; unmatchedTreatments: number };
  /** 交絡除外の実績。 */
  confounders?: { excludedCount: number; scanned: boolean };
  /** PIT 検査の結果。 */
  pit?: { violations: number; checked: boolean };
  paperTrades?: PaperTradeReconciliation;
}

export interface GateEvidenceRow {
  gate: GateKey;
  supported: boolean;
  /** 裏付けの内容。supported が false なら何が無いか。 */
  evidence: string;
  /** 埋めるために必要な作業。supported なら undefined。 */
  missing?: string;
}

export interface GateEvidenceReport {
  edgeId: string;
  rows: GateEvidenceRow[];
  supportedCount: number;
  totalCount: number;
  /** 判断を誤らせうる点。 */
  warnings: string[];
}

const DEFAULT_MIN_CLUSTERS = 10;

function unsupported(gate: GateKey, evidence: string, missing: string): GateEvidenceRow {
  return { gate, supported: false, evidence, missing };
}

function supported(gate: GateKey, evidence: string): GateEvidenceRow {
  return { gate, supported: true, evidence };
}

/**
 * 成果物から Gate の裏付けを導出する。
 *
 * 証拠が無い Gate は supported: false。既定で通さない。
 */
export function deriveGateEvidence(input: GateEvidenceInput): GateEvidenceReport {
  if (typeof input.edgeId !== "string" || input.edgeId.trim() === "") {
    throw new Error("gate evidence edgeId must be a non-empty string");
  }
  if (!Number.isSafeInteger(input.requiredSamples) || input.requiredSamples < 1) {
    throw new Error(`requiredSamples must be a positive safe integer: ${input.requiredSamples}`);
  }
  const minClusters = input.minClusters ?? DEFAULT_MIN_CLUSTERS;
  if (!Number.isSafeInteger(minClusters) || minClusters < 1) {
    throw new Error(`minClusters must be a positive safe integer: ${minClusters}`);
  }

  const warnings: string[] = [];
  const rows: GateEvidenceRow[] = [];

  // --- sufficientSamples ---
  const treatmentStats = input.eventStudy?.summaryByHorizon.at(-1)?.treatment;
  if (!treatmentStats) {
    rows.push(unsupported(
      "sufficientSamples",
      "イベントスタディの結果がありません",
      "research:edge-study を実データで実行する",
    ));
  } else if (treatmentStats.count < input.requiredSamples) {
    rows.push(unsupported(
      "sufficientSamples",
      `サンプル ${treatmentStats.count} 件（必要 ${input.requiredSamples} 件）`,
      `あと ${input.requiredSamples - treatmentStats.count} 件のラベル済みイベントが必要`,
    ));
  } else if ((treatmentStats.clusterCount ?? 0) < minClusters) {
    rows.push(unsupported(
      "sufficientSamples",
      `サンプルは足りているがクラスタが ${treatmentStats.clusterCount ?? 0} 件（必要 ${minClusters} 件）`,
      "同日に偏らないよう、異なるイベント日のサンプルを増やす",
    ));
    warnings.push(
      "サンプル数だけを見ると足りているように見えますが、"
      + "同日イベントが多く実効的な観測数は少ない状態です",
    );
  } else {
    rows.push(supported(
      "sufficientSamples",
      `サンプル ${treatmentStats.count} 件 / クラスタ ${treatmentStats.clusterCount} 件`,
    ));
  }

  // --- holdoutPass ---
  if (!input.holdout) {
    rows.push(unsupported("holdoutPass", "Holdout の扱いが記録されていません", "封印期間を分割して検証する"));
  } else if (input.holdout.openedWindowIds.length === 0) {
    rows.push(unsupported(
      "holdoutPass",
      input.holdout.partitioned ? "封印期間を除外して検証済み（未開封）" : "封印期間を分割していません",
      "Production 判定の段階で access_log を記録したうえで開封し、その結果で判定する",
    ));
  } else if (!input.holdout.accessRecorded) {
    rows.push(unsupported(
      "holdoutPass",
      `開封 ${input.holdout.openedWindowIds.join(", ")} に access_log の記録がありません`,
      "access_log へ開封記録を追記する",
    ));
    warnings.push("記録の無い開封が行われています。封印の意味が失われている可能性があります");
  } else {
    rows.push(supported("holdoutPass", `開封済み: ${input.holdout.openedWindowIds.join(", ")}`));
  }

  // --- pitSafe ---
  if (!input.pit?.checked) {
    rows.push(unsupported("pitSafe", "PIT 検査を実行していません", "checkPit を通す"));
  } else if (input.pit.violations > 0) {
    rows.push(unsupported("pitSafe", `PIT 違反 ${input.pit.violations} 件`, "違反を解消する"));
  } else {
    rows.push(supported("pitSafe", "PIT 違反 0 件"));
  }

  // --- netAlphaPositive ---
  const net = input.backtest?.net;
  if (!net) {
    rows.push(unsupported("netAlphaPositive", "backtest の結果がありません", "research:backtest を実データで実行する"));
  } else if (net.meanNetAlphaBps <= 0) {
    rows.push(unsupported(
      "netAlphaPositive",
      `手数料後平均 ${net.meanNetAlphaBps.toFixed(0)}bps`,
      "この Edge は現状プラスではありません。閾値をいじらず、別の Edge を検討する",
    ));
  } else if (net.clusteredTStat === null) {
    rows.push(unsupported(
      "netAlphaPositive",
      `平均は +${net.meanNetAlphaBps.toFixed(0)}bps だが、クラスタ補正後の t を算出できません`,
      "異なるイベント日のサンプルを増やす",
    ));
  } else {
    rows.push(supported(
      "netAlphaPositive",
      `手数料後平均 +${net.meanNetAlphaBps.toFixed(0)}bps / t=${net.clusteredTStat.toFixed(2)}`,
    ));
  }

  // --- executionFeasible ---
  if (!input.backtest) {
    rows.push(unsupported("executionFeasible", "backtest の結果がありません", "執行可否を含む backtest を実行する"));
  } else {
    const blocked = Object.entries(input.backtest.skippedReasons)
      .filter(([reason]) => reason.startsWith("liquidity_") || reason.startsWith("pit_") || reason.includes("limit"))
      .reduce((sum, [, count]) => sum + count, 0);
    const fillRate = input.paperTrades?.fillRate;
    if (fillRate !== undefined && fillRate !== null && fillRate < 1) {
      rows.push(unsupported(
        "executionFeasible",
        `紙トレードの約定率 ${(fillRate * 100).toFixed(0)}%`,
        "約定しなかった原因を特定し、backtest の前提に反映する",
      ));
      warnings.push(
        "backtest は全件約定を前提にしています。実際の約定率がそれを下回る分だけ結果は良く出ています",
      );
    } else if (blocked > 0) {
      rows.push(unsupported(
        "executionFeasible",
        `執行できず落ちた件数 ${blocked}`,
        "流動性・値幅制限の制約を満たす対象へ絞る",
      ));
    } else if (fillRate === undefined || fillRate === null) {
      rows.push(unsupported(
        "executionFeasible",
        "backtest 上は執行できているが、実際の約定実績がありません",
        "紙トレードで約定率と滑りを実測する",
      ));
    } else {
      rows.push(supported("executionFeasible", `紙トレード約定率 100% / backtest の執行 skip 0`));
    }
  }

  // --- liquiditySufficient ---
  if (!input.backtest) {
    rows.push(unsupported("liquiditySufficient", "backtest の結果がありません", "流動性制約付きで backtest を実行する"));
  } else {
    const liquidityBlocked = Object.entries(input.backtest.skippedReasons)
      .filter(([reason]) => reason.startsWith("liquidity_"))
      .reduce((sum, [, count]) => sum + count, 0);
    rows.push(liquidityBlocked > 0
      ? unsupported(
        "liquiditySufficient",
        `流動性で落ちた件数 ${liquidityBlocked}`,
        "参加率・最低売買代金を満たす対象へ絞るか、想定金額を下げる",
      )
      : supported("liquiditySufficient", "流動性制約で落ちた取引 0 件"));
  }

  // --- borrowCostCovered ---
  if (!input.backtest) {
    rows.push(unsupported("borrowCostCovered", "backtest の結果がありません", "borrow コストを含めて計算する"));
  } else if (!input.backtest.borrowCostIncluded) {
    rows.push(unsupported(
      "borrowCostCovered",
      "borrow コストを計算に含めていません",
      "ショートを含むなら CostModel に borrowCostAnnualBps を設定する",
    ));
  } else {
    rows.push(supported("borrowCostCovered", "borrow コスト込みで計算済み"));
  }

  // --- confoundersRemoved ---
  if (!input.confounders?.scanned) {
    rows.push(unsupported(
      "confoundersRemoved",
      "交絡スキャンを実行していません",
      "決算・増資・M&A など説明のつくイベントを除外する",
    ));
  } else {
    rows.push(supported(
      "confoundersRemoved",
      `交絡として ${input.confounders.excludedCount} 件を除外済み`,
    ));
  }

  // --- counterfactualExplained ---
  if (!input.controls) {
    rows.push(unsupported("counterfactualExplained", "対照群がありません", "matched drawdown control を作る"));
  } else if (input.controls.matched === 0) {
    rows.push(unsupported(
      "counterfactualExplained",
      `対照 0 件 / 未マッチ ${input.controls.unmatchedTreatments} 件`,
      "ラベリングで treatment を絞り、同程度の下落を対照候補として残す",
    ));
  } else if (input.controls.unmatchedTreatments > 0) {
    rows.push(unsupported(
      "counterfactualExplained",
      `対照 ${input.controls.matched} 件 / 未マッチ ${input.controls.unmatchedTreatments} 件`,
      "未マッチの treatment に対照を用意する（残った分だけの比較は偏る）",
    ));
  } else {
    rows.push(supported("counterfactualExplained", `全 treatment に対照あり（${input.controls.matched} 件）`));
  }

  // --- decayChecked ---
  if (!input.decay) {
    rows.push(unsupported("decayChecked", "劣化判定を実行していません", "期間を分けて checkEdgeDecay を通す"));
  } else if (input.decay.verdict === "insufficient_data") {
    rows.push(unsupported(
      "decayChecked",
      "劣化判定はサンプル不足で判定できていません",
      "各期間のクラスタ数を増やす",
    ));
  } else if (input.decay.verdict !== "maintained") {
    rows.push(unsupported(
      "decayChecked",
      `劣化判定: ${input.decay.verdict}`,
      "直近で効きが落ちています。Production へ上げる前に原因を特定する",
    ));
  } else {
    rows.push(supported("decayChecked", "劣化判定: maintained"));
  }

  // --- falseDiscoveryGuard ---
  if (!input.backtest) {
    rows.push(unsupported("falseDiscoveryGuard", "backtest の結果がありません", "試行回数込みで判定する"));
  } else {
    rows.push(input.backtest.falseDiscoveryPassed
      ? supported("falseDiscoveryGuard", "試行回数を考慮した閾値を上回っています")
      : unsupported(
        "falseDiscoveryGuard",
        "試行回数に対する要求 t 値に届いていません",
        "サンプルを増やすか、試行を減らす。閾値を緩めることで通してはいけない",
      ));
  }

  const ordered = GATE_KEYS.map((gate) => rows.find((row) => row.gate === gate)!);
  const supportedCount = ordered.filter((row) => row.supported).length;

  if (supportedCount === ordered.length) {
    warnings.push(
      "全 Gate に裏付けがありますが、これは Production への自動昇格を意味しません。"
      + "昇格の判断は人間が行います",
    );
  }

  return {
    edgeId: input.edgeId,
    rows: ordered,
    supportedCount,
    totalCount: ordered.length,
    warnings,
  };
}

/** 人が読む形。何が足りないかを並べる。 */
export function formatGateEvidence(report: GateEvidenceReport): string {
  const lines = [`Edge: ${report.edgeId} — 裏付けのある Gate ${report.supportedCount}/${report.totalCount}`, ""];
  for (const row of report.rows) {
    lines.push(`${row.supported ? "✅" : "❌"} ${row.gate}: ${row.evidence}`);
    if (row.missing) lines.push(`     → ${row.missing}`);
  }
  if (report.warnings.length > 0) {
    lines.push("");
    for (const warning of report.warnings) lines.push(`⚠ ${warning}`);
  }
  return lines.join("\n");
}
