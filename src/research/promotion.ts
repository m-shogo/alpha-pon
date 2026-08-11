// Research OS — Production Gate 判定と Holdout Vault。
//
// 重要:
//   Gate の各項目は「自己申告 pass」では通らない。
//   構造的に検証できる項目は、Registry 上のデータと突き合わせて裏取りする。
//   ここを緩めると Research OS の存在意義（未検証 Production の禁止）が消える。

import type { Issue } from "./edge-registry.js";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";
import { checkPit } from "./pit.js";
import { isValidDate } from "./schema.js";
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

const DAY_MS = 86_400_000;

function epochDay(value: string, field: string): number {
  if (!isValidDate(value)) throw new Error(`${field} must be a real YYYY-MM-DD date`);
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return Math.trunc(Date.UTC(year, month - 1, day) / DAY_MS);
}

function daysBetween(from: string, to: string): number {
  return epochDay(to, "promotion asOf") - epochDay(from, "edge.decay.lastCheckedAt");
}

function asOfCutoffMs(asOf: string): number {
  epochDay(asOf, "promotion asOf");
  return parseExplicitIso8601Instant(`${asOf}T23:59:59.999+09:00`, "promotion asOf cutoff");
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
  cutoffMs: number,
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
    } else {
      const eligible: HoldoutAccessEntry[] = [];
      let invalidTimestamp = false;
      for (const entry of opened) {
        let openedAtMs: number;
        try {
          openedAtMs = parseExplicitIso8601Instant(entry.openedAt, `holdout access ${entry.id}.openedAt`);
        } catch {
          invalidTimestamp = true;
          continue;
        }
        if (openedAtMs <= cutoffMs) eligible.push(entry);
      }

      if (invalidTimestamp) {
        unsupported.push({
          gate: "holdoutPass",
          reason: "Holdout 開封記録に不正な openedAt があります",
        });
      } else if (eligible.length === 0) {
        unsupported.push({
          gate: "holdoutPass",
          reason: `${asOf} 時点で利用可能な Holdout 開封記録がありません`,
        });
      } else {
        eligible.sort((left, right) => {
          const instantOrder = compareExplicitIso8601Instants(
            right.openedAt,
            left.openedAt,
            `holdout access ${right.id}.openedAt`,
            `holdout access ${left.id}.openedAt`,
          );
          return instantOrder !== 0 ? instantOrder : left.id.localeCompare(right.id);
        });
        const latestInstant = eligible[0]!.openedAt;
        const latest = eligible.filter((entry) =>
          compareExplicitIso8601Instants(
            entry.openedAt,
            latestInstant,
            `holdout access ${entry.id}.openedAt`,
            `holdout access ${eligible[0]!.id}.openedAt`,
          ) === 0,
        );
        const latestResults = new Set(latest.map((entry) => entry.result));
        if (latestResults.size !== 1) {
          unsupported.push({
            gate: "holdoutPass",
            reason: "最新の Holdout 開封時刻に pass / fail の競合があります",
          });
        } else if (latest[0]!.result !== "pass") {
          unsupported.push({
            gate: "holdoutPass",
            reason: `最新の Holdout 開封記録(${latest[0]!.id})が pass ではありません`,
          });
        }
      }
    }
  }

  if (claim("pitSafe")) {
    const pitErrors = checkPit(state, new Date(cutoffMs)).filter(
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
    } else if (!isValidDate(edge.decay.lastCheckedAt)) {
      unsupported.push({ gate: "decayChecked", reason: "decay.lastCheckedAt が実在する YYYY-MM-DD ではありません" });
    } else {
      const elapsed = daysBetween(edge.decay.lastCheckedAt, asOf);
      if (elapsed < 0) {
        unsupported.push({
          gate: "decayChecked",
          reason: `decay.lastCheckedAt(${edge.decay.lastCheckedAt}) が asOf(${asOf}) より未来です`,
        });
      } else if (elapsed > edge.decay.reviewIntervalDays) {
        unsupported.push({
          gate: "decayChecked",
          reason: `最終確認から ${elapsed} 日経過（上限 ${edge.decay.reviewIntervalDays} 日）`,
        });
      }
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
  const cutoffMs = asOfCutoffMs(asOf);
  const blockers: GateEvaluation["blockers"] = [];
  for (const gate of GATE_KEYS) {
    const item = edge.promotionGate[gate];
    if (item.state === "pass") continue;
    blockers.push({
      gate,
      reason: item.state === "fail" ? `${GATE_LABELS[gate]}: FAIL` : `${GATE_LABELS[gate]}: 未確認`,
    });
  }

  const unsupportedPasses = verifyPassClaims(edge, state, accessLog, asOf, cutoffMs);
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

function assertValidHoldoutManifest(manifest: HoldoutManifest): void {
  if (!isValidDate(manifest.sealedAt)) {
    throw new Error("holdout manifest sealedAt must be a real YYYY-MM-DD date");
  }
  for (const window of manifest.windows) {
    if (!isValidDate(window.from)) {
      throw new Error(`holdout window ${window.id}.from must be a real YYYY-MM-DD date`);
    }
    if (!isValidDate(window.to)) {
      throw new Error(`holdout window ${window.id}.to must be a real YYYY-MM-DD date`);
    }
    if (window.from > window.to) {
      throw new Error(`holdout window ${window.id} must have from <= to`);
    }
  }
}

/** Holdout の封印範囲に触れているかの判定。研究中データのフィルタに使う。 */
export function isInHoldout(manifest: HoldoutManifest, code: string, date: string): boolean {
  if (!isValidDate(date)) throw new Error("holdout lookup date must be a real YYYY-MM-DD date");
  assertValidHoldoutManifest(manifest);
  return manifest.windows.some((window) => {
    if (date < window.from || date > window.to) return false;
    if (window.scope === "all_universe") return true;
    return (window.codes ?? []).includes(code);
  });
}
