// Research OS — Edge Decay Monitor。
// 「昔は効いた Edge が今も効くか」を、期限管理と劣化スコアの両面で監視する。

import type { Issue } from "./edge-registry.js";
import { isValidDate } from "./schema.js";
import type { Edge, ResearchState } from "./types.js";

export type DecayStatus = "never_checked" | "fresh" | "due_soon" | "overdue" | "decayed";

export interface DecayReportEntry {
  edgeId: string;
  title: string;
  status: Edge["status"];
  decayStatus: DecayStatus;
  lastCheckedAt: string | null;
  daysSinceCheck: number | null;
  reviewIntervalDays: number;
  score: number | null;
  action: string;
}

/** score がこれを下回ったら「劣化した」とみなし、Deprecated 検討の対象にする。 */
export const DECAYED_SCORE_THRESHOLD = 0.3;
const DUE_SOON_RATIO = 0.8;
const DAY_MS = 86_400_000;

function epochDay(value: string, field: string): number {
  if (!isValidDate(value)) {
    throw new Error(`${field} must be a real YYYY-MM-DD date`);
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return Math.trunc(Date.UTC(year, month - 1, day) / DAY_MS);
}

function daysBetween(from: string, to: string): number {
  const fromDay = epochDay(from, "edge.decay.lastCheckedAt");
  const toDay = epochDay(to, "decay asOf");
  if (fromDay > toDay) {
    throw new Error("edge.decay.lastCheckedAt must be on or before decay asOf");
  }
  return toDay - fromDay;
}

export function classifyDecay(edge: Edge, asOf: string): { status: DecayStatus; daysSinceCheck: number | null } {
  // Validate asOf even when the Edge has never been checked. Otherwise an invalid
  // snapshot date could silently produce a plausible-looking never_checked state.
  epochDay(asOf, "decay asOf");

  if (typeof edge.decay.score === "number" && edge.decay.score < DECAYED_SCORE_THRESHOLD) {
    return {
      status: "decayed",
      daysSinceCheck: edge.decay.lastCheckedAt ? daysBetween(edge.decay.lastCheckedAt, asOf) : null,
    };
  }
  if (!edge.decay.lastCheckedAt) return { status: "never_checked", daysSinceCheck: null };

  const elapsed = daysBetween(edge.decay.lastCheckedAt, asOf);
  if (elapsed > edge.decay.reviewIntervalDays) return { status: "overdue", daysSinceCheck: elapsed };
  if (elapsed >= edge.decay.reviewIntervalDays * DUE_SOON_RATIO) return { status: "due_soon", daysSinceCheck: elapsed };
  return { status: "fresh", daysSinceCheck: elapsed };
}

const ACTIONS: Record<DecayStatus, string> = {
  never_checked: "初回の Decay 確認を行う",
  fresh: "対応不要",
  due_soon: "次回サイクルで Decay 確認を予定する",
  overdue: "Decay 再検証（期限超過）",
  decayed: "劣化を確認。Deprecated への変更を検討する",
};

export function buildDecayReport(state: ResearchState, asOf: string): DecayReportEntry[] {
  return state.edges
    .filter((edge) => edge.status !== "rejected")
    .map((edge) => {
      const { status, daysSinceCheck } = classifyDecay(edge, asOf);
      return {
        edgeId: edge.id,
        title: edge.title,
        status: edge.status,
        decayStatus: status,
        lastCheckedAt: edge.decay.lastCheckedAt ?? null,
        daysSinceCheck,
        reviewIntervalDays: edge.decay.reviewIntervalDays,
        score: edge.decay.score ?? null,
        action: ACTIONS[status],
      };
    })
    .sort((a, b) => (a.edgeId < b.edgeId ? -1 : 1));
}

/** Production / Shadow の Edge が Decay 期限を超過していたら警告する。 */
export function checkDecay(state: ResearchState, asOf: string): Issue[] {
  const issues: Issue[] = [];
  for (const entry of buildDecayReport(state, asOf)) {
    if (entry.status !== "production" && entry.status !== "shadow") continue;
    if (entry.decayStatus === "overdue" || entry.decayStatus === "never_checked") {
      issues.push({
        severity: entry.status === "production" ? "error" : "warning",
        code: "decay_overdue",
        target: entry.edgeId,
        message: `${entry.status} の Edge の Decay 確認が ${
          entry.daysSinceCheck === null ? "一度も行われていません" : `${entry.daysSinceCheck} 日前で期限超過です`
        }`,
      });
    }
    if (entry.decayStatus === "decayed") {
      issues.push({
        severity: "error",
        code: "edge_decayed",
        target: entry.edgeId,
        message: `Decay スコアが ${entry.score} まで低下しています。Production/Shadow の継続可否を判断してください`,
      });
    }
  }
  return issues;
}
