// Research OS — Production Gate 判定と Holdout Vault。
//
// 重要:
//   Gate の各項目は「自己申告 pass」では通らない。
//   構造的に検証できる項目は、Registry 上のデータと突き合わせて裏取りする。
//   ここを緩めると Research OS の存在意義（未検証 Production の禁止）が消える。

import type { Issue } from "./edge-registry.js";
import { checkPit } from "./pit.js";
import type { Edge, GateKey, ResearchState } from "./types.js";
import { GATE_KEYS } from "./types.js";

export interface HoldoutWindow {
  id: string;
  from: string;
  to: string;
  scope: "all_universe" | "named_codes";
  codes?: string[];
  notes?: string;
}

export interface HoldoutManifest {
  schemaVersion: 1;
  sealedAt: string;
  policy: string;
  windows: HoldoutWindow[];
}

export interface HoldoutAccessEntry {
  schemaVersion: 1;
  id: string;
  edgeId: string;
  windowId: string;
  openedAt: string;
  actor: string;
  purpose: "production_gate";
  result: "pass" | "fail";
  netAlphaBps?: number;
  sampleCount?: number;
  notes?: string;
}

export interface GateEvaluation {
  edgeId: string;
  passCount: number;
  totalCount: number;
  promotable: boolean;
  blockers: Array<{ gate: GateKey; reason: string }>;
  /** 自己申告 pass だが裏取りに失敗した項目（最も危険なので分けて返す） */
  unsupportedPasses: Array<{ gate: GateKey; reason: string }>;
}

const GATE_LABELS: Record<GateKey, string> = {
  sufficientSamples: "十分なサンプル数",
  holdoutPass: "Holdout PASS",
  pitSafe: "PIT Safe",
  netAlphaPositive: "Net Alpha が正",
  executionFeasible: "Execution 可能",
  liquiditySufficient: "Liquidity 十分",
  borrowCostCovered: "Borrow 込みで利益",
  confoundersRemoved: "Confounder 除去",
  counterfactualExplained: "Counterfactual 説明可能",
  decayChecked: "Edge Decay 確認",
  falseDiscoveryGuard: "False Discovery Guard 通過",
};

export function gateLabel(gate: GateKey): string {
  return GATE_LABELS[gate];
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00+09:00`) - Date.parse(`${from}T00:00:00+09:00`)) / 86_400_000);
}

/**
 * 構造的に裏取りできる Gate 項目を検証する。
 * 「pass と書いてあるが、データがそれを支えていない」ケースを返す。
 */
function verifyPassClaims(
  edge: Edge,
  state: ResearchState,
  accessLog: HoldoutAccessEntry[],
  asOf: string,
): Array<{ gate: GateKey; reason: string }> {
  const unsupported: Array<{ gate: GateKey; reason: string }> = [];
  const claim = (gate: GateKey) => edge.promotionGate[gate].state === "pass";

  if (claim("sufficientSamples") && edge.samples.current < edge.samples.required) {
    unsupported.push({
      gate: "sufficientSamples",
      reason: `サンプルが ${edge.samples.current}/${edge.samples.required} しかありません`,
    });
  }

  if (claim("holdoutPass")) {
    const opened = accessLog.filter((entry) => entry.edgeId === edge.id && entry.purpose === "production_gate");
    if (opened.length === 0) {
      unsupported.push({ gate: "holdoutPass", reason: "Holdout 開封記録（access_log）がありません" });
    } else if (opened.every((entry) => entry.result !== "pass")) {
      unsupported.push({ gate: "holdoutPass", reason: "Holdout 開封記録の結果が pass ではありません" });
    }
  }

  if (claim("pitSafe")) {
    const pitErrors = checkPit(state, new Date(`${asOf}T23:59:59+09:00`)).filter(
      (issue) => issue.severity === "error" && issue.target.startsWith(edge.id),
    );
    if (pitErrors.length > 0) {
      unsupported.push({ gate: "pitSafe", reason: `PIT エラーが ${pitErrors.length} 件残っています` });
    }
  }

  if (claim("counterfactualExplained")) {
    const linked = state.counterfactuals.filter(
      (cf) => cf.edgeId === edge.id || (edge.analogIds ?? []).includes(cf.analogId),
    );
    if (linked.length === 0) {
      unsupported.push({ gate: "counterfactualExplained", reason: "紐づく Counterfactual が 1 件もありません" });
    }
  }

  if (claim("confoundersRemoved")) {
    const unresolved = state.confounders.filter(
      (confounder) =>
        (confounder.edgeId === edge.id ||
          (confounder.analogId && (edge.analogIds ?? []).includes(confounder.analogId))) &&
        confounder.handling === "acknowledged_unresolved",
    );
    if (unresolved.length > 0) {
      unsupported.push({
        gate: "confoundersRemoved",
        reason: `未処理の Confounder が ${unresolved.length} 件あります（${unresolved.map((c) => c.id).join(", ")}）`,
      });
    }
  }

  if (claim("decayChecked")) {
    if (!edge.decay.lastCheckedAt) {
      unsupported.push({ gate: "decayChecked", reason: "decay.lastCheckedAt がありません" });
    } else if (daysBetween(edge.decay.lastCheckedAt, asOf) > edge.decay.reviewIntervalDays) {
      unsupported.push({
        gate: "decayChecked",
        reason: `最終確認から ${daysBetween(edge.decay.lastCheckedAt, asOf)} 日経過（上限 ${edge.decay.reviewIntervalDays} 日）`,
      });
    }
  }

  if (claim("executionFeasible") && edge.execution?.feasibility !== "feasible") {
    unsupported.push({
      gate: "executionFeasible",
      reason: `execution.feasibility が ${edge.execution?.feasibility ?? "未設定"} です`,
    });
  }

  if (claim("borrowCostCovered") && edge.entry.side === "short") {
    if (edge.execution?.borrowAvailability !== "available") {
      unsupported.push({
        gate: "borrowCostCovered",
        reason: `ショート戦略ですが borrowAvailability が ${edge.execution?.borrowAvailability ?? "未設定"} です`,
      });
    }
  }

  return unsupported;
}

export function evaluateGate(
  edge: Edge,
  state: ResearchState,
  accessLog: HoldoutAccessEntry[],
  asOf: string,
): GateEvaluation {
  const blockers: GateEvaluation["blockers"] = [];
  for (const gate of GATE_KEYS) {
    const item = edge.promotionGate[gate];
    if (item.state === "pass") continue;
    blockers.push({
      gate,
      reason: item.state === "fail" ? `${GATE_LABELS[gate]}: FAIL` : `${GATE_LABELS[gate]}: 未確認`,
    });
  }

  const unsupportedPasses = verifyPassClaims(edge, state, accessLog, asOf);
  const passCount = GATE_KEYS.filter((gate) => edge.promotionGate[gate].state === "pass").length;

  return {
    edgeId: edge.id,
    passCount,
    totalCount: GATE_KEYS.length,
    promotable: blockers.length === 0 && unsupportedPasses.length === 0,
    blockers,
    unsupportedPasses,
  };
}

/** status: production の Edge が本当に Gate を通っているかを検査する（CI の最終防衛線）。 */
export function checkProductionIntegrity(
  state: ResearchState,
  accessLog: HoldoutAccessEntry[],
  asOf: string,
): Issue[] {
  const issues: Issue[] = [];

  for (const edge of state.edges) {
    const evaluation = evaluateGate(edge, state, accessLog, asOf);

    for (const unsupported of evaluation.unsupportedPasses) {
      issues.push({
        severity: "error",
        code: "unsupported_gate_pass",
        target: `${edge.id}.${unsupported.gate}`,
        message: `pass と記録されていますが裏取りできません: ${unsupported.reason}`,
      });
    }

    if (edge.status === "production" && !evaluation.promotable) {
      issues.push({
        severity: "error",
        code: "unverified_production",
        target: edge.id,
        message: `Production Gate を通過していないのに status: production です（未通過: ${evaluation.blockers
          .map((blocker) => blocker.gate)
          .join(", ")}）`,
      });
    }

    if (edge.status === "shadow" && evaluation.promotable) {
      issues.push({
        severity: "warning",
        code: "promotion_ready",
        target: edge.id,
        message: "Production Gate をすべて通過しています。昇格判断（人間）の対象です",
      });
    }
  }

  return issues;
}

/** Holdout の封印範囲に触れているかの判定。研究中データのフィルタに使う。 */
export function isInHoldout(manifest: HoldoutManifest, code: string, date: string): boolean {
  return manifest.windows.some((window) => {
    if (date < window.from || date > window.to) return false;
    if (window.scope === "all_universe") return true;
    return (window.codes ?? []).includes(code);
  });
}
