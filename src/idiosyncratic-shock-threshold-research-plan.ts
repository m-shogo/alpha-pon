// Threshold diversity不足を埋める研究queueの優先順位。
// future returnは一切使わず、現在のPASS control構成と未解決caseのscore/market/category/replay readinessだけで決める。

import {
  THRESHOLD_DIVERSITY_TARGETS,
  summarizeThresholdDiversity,
  type ThresholdDiversityRow,
} from "./idiosyncratic-shock-threshold-diversity-audit.js";

export type ThresholdResearchPriorityRow = ThresholdDiversityRow & {
  priorityScore: number;
  gapReasons: string[];
};

export type ThresholdResearchPlan = {
  deficits: {
    totalReplayReadyBelow12: number;
    nearBoundary10to11: number;
    deeper8to9: number;
    distinctCategories: number;
    jpControls: number;
    usControls: number;
    usable3mBelow12: number;
  };
  queue: ThresholdResearchPriorityRow[];
};

function deficit(target: number, actual: number): number {
  return Math.max(0, target - actual);
}

export function buildThresholdResearchPlan(rows: ThresholdDiversityRow[]): ThresholdResearchPlan {
  const summary = summarizeThresholdDiversity(rows);
  const controls = rows.filter(row => row.calibrationEligibility === "confirmed_pass" && row.replayReady && row.supportedMarket);
  const controlCategories = new Set(controls.map(row => row.category));

  const deficits = {
    totalReplayReadyBelow12: deficit(THRESHOLD_DIVERSITY_TARGETS.totalReplayReadyBelow12, summary.totalReplayReadyBelow12),
    nearBoundary10to11: deficit(THRESHOLD_DIVERSITY_TARGETS.nearBoundary10to11, summary.nearBoundary10to11),
    deeper8to9: deficit(THRESHOLD_DIVERSITY_TARGETS.deeper8to9, summary.deeper8to9),
    distinctCategories: deficit(THRESHOLD_DIVERSITY_TARGETS.distinctCategories, summary.distinctCategories),
    jpControls: deficit(THRESHOLD_DIVERSITY_TARGETS.jpControls, summary.jpControls),
    usControls: deficit(THRESHOLD_DIVERSITY_TARGETS.usControls, summary.usControls),
    usable3mBelow12: deficit(THRESHOLD_DIVERSITY_TARGETS.usable3mBelow12, summary.usable3mBelow12),
  };

  const queue = rows
    .filter(row => row.calibrationEligibility === "unknown")
    .filter(row => row.supportedMarket)
    .filter(row => row.score >= 8 && row.score <= 11)
    .map(row => {
      const gapReasons: string[] = [];
      let priorityScore = 0;

      if (row.score >= 8 && row.score <= 9 && deficits.deeper8to9 > 0) {
        priorityScore += 40;
        gapReasons.push(`score8-9 deficit ${deficits.deeper8to9}`);
      }
      if (row.score >= 10 && row.score <= 11 && deficits.nearBoundary10to11 > 0) {
        priorityScore += 30;
        gapReasons.push(`score10-11 deficit ${deficits.nearBoundary10to11}`);
      }
      if (row.market === "JP" && deficits.jpControls > 0) {
        priorityScore += 20;
        gapReasons.push(`JP deficit ${deficits.jpControls}`);
      }
      if (row.market === "US" && deficits.usControls > 0) {
        priorityScore += 20;
        gapReasons.push(`US deficit ${deficits.usControls}`);
      }
      if (!controlCategories.has(row.category) && deficits.distinctCategories > 0) {
        priorityScore += 15;
        gapReasons.push(`new category candidate: ${row.category}`);
      }
      if (row.replayReady) {
        priorityScore += 5;
        gapReasons.push("reaction anchor already replay-ready");
      }
      if (deficits.totalReplayReadyBelow12 > 0) {
        priorityScore += 1;
      }

      return { ...row, priorityScore, gapReasons };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.score - b.score || a.id.localeCompare(b.id));

  return { deficits, queue };
}
