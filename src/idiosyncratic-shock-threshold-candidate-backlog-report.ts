import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { buildThresholdDiversityRows, summarizeThresholdDiversity } from "./idiosyncratic-shock-threshold-diversity-audit.js";
import {
  loadThresholdCandidateBacklog,
  rankThresholdCandidateBacklog,
  summarizeThresholdCandidateBacklogStatus,
} from "./idiosyncratic-shock-threshold-candidate-backlog.js";

function main(): void {
  const date = todayJst();
  const backlog = loadThresholdCandidateBacklog();
  const diversityRows = buildThresholdDiversityRows();
  const diversity = summarizeThresholdDiversity(diversityRows);
  const queue = rankThresholdCandidateBacklog(backlog.candidates, diversityRows);
  const status = summarizeThresholdCandidateBacklogStatus(backlog.candidates, diversityRows);

  const payload = {
    generatedAt: date,
    backlogGeneratedAt: backlog.generatedAt,
    selectionBasis: backlog.selectionPolicy.basis,
    thresholdChangeReady: diversity.ready,
    replenishmentRequired: status.replenishmentRequired,
    currentControlSummary: {
      replayReadyBelow12: diversity.totalReplayReadyBelow12,
      nearBoundary10to11: diversity.nearBoundary10to11,
      deeper8to9: diversity.deeper8to9,
      distinctCategories: diversity.distinctCategories,
      jpControls: diversity.jpControls,
      usControls: diversity.usControls,
    },
    candidateCount: backlog.candidates.length,
    activeCandidateCount: queue.length,
    promotedCandidateCount: status.promotedCount,
    rejectedCandidateCount: status.rejectedCount,
    blockers: status.blockers,
    queue,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_threshold_candidate_backlog_latest.json", JSON.stringify(payload, null, 2), "utf-8");

  const lines = [
    "# Threshold Candidate Backlog",
    "",
    `生成日: ${date}`,
    `backlog freeze: ${backlog.generatedAt}`,
    "",
    `- selection basis: **${backlog.selectionPolicy.basis}**`,
    `- threshold change readiness: **${diversity.ready ? "READY" : "NOT READY"}**`,
    `- backlog replenishment: **${status.replenishmentRequired ? "REQUIRED" : "NOT REQUIRED"}**`,
    `- replay-ready below12: ${diversity.totalReplayReadyBelow12}`,
    `- score10-11: ${diversity.nearBoundary10to11}`,
    `- score8-9: ${diversity.deeper8to9}`,
    `- categories: ${diversity.distinctCategories}`,
    `- JP / US controls: ${diversity.jpControls} / ${diversity.usControls}`,
    `- promoted / rejected / active: ${status.promotedCount} / ${status.rejectedCount} / ${status.activeCandidateCount}`,
    "",
    "> このbacklogは候補選定時に未採点。候補順位にhistorical return、recovery pattern、realized outcome、post-event price pathを使用しない。",
    "> scoreを8-11へ合わせることを禁止し、PIT-safe一次情報で採点した結果がband外ならそのまま受け入れる。",
    "> active候補が0でもthreshold diversityが未達なら研究完了ではなく、outcome-blindな次batchの補充が必要。",
    "",
    "## blockers",
    "",
    ...(status.blockers.length ? status.blockers.map(blocker => `- ${blocker}`) : ["- none"]),
    "",
    "## Research order",
    "",
  ];

  if (queue.length === 0) lines.push("- none");
  else {
    for (const row of queue) {
      lines.push(`### ${row.market} ${row.ticker} ${row.company} — ${row.category}`);
      lines.push(`- id/state: ${row.id} / ${row.researchState}`);
      lines.push(`- event: ${row.eventDate}`);
      lines.push(`- priority: ${row.priorityScore}`);
      lines.push(`- why selected: ${row.discoveryReason}`);
      lines.push(`- gap reasons: ${row.gapReasons.join(" / ")}`);
      lines.push(`- primary source: ${row.primarySource.title} (${row.primarySource.publishedAt})`);
      lines.push("");
    }
  }

  writeFileSync("reports/idiosyncratic_shock_threshold_candidate_backlog_latest.md", lines.join("\n"), "utf-8");
  console.log(`shock threshold candidate backlog: candidates=${backlog.candidates.length} active=${queue.length} controls=${diversity.totalReplayReadyBelow12} ready=${diversity.ready} replenish=${status.replenishmentRequired}`);
}

main();
