// score 8-11のthreshold-calibration unknownを一次情報調査用queueへ変換する。
// 「低scoreだからPASS」ではなく、何が欠けているかを明示して次の調査を決める。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibilityDetailed,
  resolveHistoricalThresholdCalibrationEligibilityDetailed,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket } from "./idiosyncratic-shock-market.js";
import {
  historicalReactionAnchorReplayBlockers,
  isHistoricalReactionAnchorReplayReady,
} from "./idiosyncratic-shock-reaction-anchor.js";

type Priority = "P0" | "P1" | "P2";

function priorityFor(input: { score: number; market: string; sourceCount: number }): Priority {
  const supported = input.market === "JP" || input.market === "US";
  if (supported && input.score >= 10) return "P0";
  if (supported && input.score >= 8) return "P1";
  return input.sourceCount > 0 ? "P1" : "P2";
}

function nextActions(input: {
  missingEvidence: string[];
  blockers: string[];
  anchorReady: boolean;
  anchorBlockers: string[];
  explicitCalibration: string | null;
}): string[] {
  const actions: string[] = [];
  if (input.explicitCalibration == null) actions.push("checkpoint時点のcalibration PASS/BLOCKを一次情報で明示判定する");
  for (const missing of input.missingEvidence) {
    if (missing.includes("Investigation")) actions.push("checkpoint時点の調査完了度を確認する");
    else if (missing.includes("Critical") || missing.includes("critical")) actions.push("免許・上場継続riskを確認する");
    else if (missing.includes("confounder")) actions.push("同日決算/業績/別事件など価格交絡を確認する");
    else if (missing.includes("source") || missing.includes("checkpoint")) actions.push("checkpoint以前の会社/規制当局/取引所一次情報を確保する");
    else actions.push(`不足証拠を解消: ${missing}`);
  }
  for (const blocker of input.blockers) actions.push(`BLOCK候補を検証: ${blocker}`);
  if (!input.anchorReady) {
    actions.push("PASS候補になった場合のみreaction anchorを調査する");
    for (const blocker of input.anchorBlockers) actions.push(`anchor不足: ${blocker}`);
  }
  return [...new Set(actions)];
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();

  const rows = cases
    .filter(item => item.score >= 8 && item.score < 12)
    .map(item => {
      const context = contexts.get(item.id);
      const production = resolveHistoricalStrategyEligibilityDetailed(item, context);
      const calibration = resolveHistoricalThresholdCalibrationEligibilityDetailed(item, context);
      const market = inferShockMarket({ country: item.country, ticker: item.ticker });
      const anchorReady = isHistoricalReactionAnchorReplayReady(context);
      const anchorBlockers = historicalReactionAnchorReplayBlockers(context);
      const explicitCalibration = context?.calibrationEligibilityAtCheckpoint ?? null;
      const sources = [
        ...item.sources.map(source => ({ ...source, origin: "case" as const })),
        ...(context?.strategyEligibilityEvidenceSources ?? []).map(source => ({ ...source, origin: "eligibility_sidecar" as const })),
      ];
      return {
        id: item.id,
        company: item.company,
        ticker: item.ticker ?? null,
        country: item.country,
        market,
        eventDate: item.eventDate,
        checkpoint: item.decisionCheckpoint,
        score: item.score,
        category: item.category,
        actorType: item.actorType,
        productionStatus: production.status,
        productionBlockers: production.blockers,
        calibrationStatus: calibration.status,
        calibrationBlockers: calibration.blockers,
        calibrationMissingEvidence: calibration.missingEvidence,
        explicitCalibration,
        anchorReady,
        anchorBlockers,
        sources,
        priority: priorityFor({ score: item.score, market, sourceCount: sources.length }),
        nextActions: nextActions({
          missingEvidence: calibration.missingEvidence,
          blockers: calibration.blockers,
          anchorReady,
          anchorBlockers,
          explicitCalibration,
        }),
      };
    })
    .sort((a, b) => {
      const rank = (value: Priority) => value === "P0" ? 0 : value === "P1" ? 1 : 2;
      return rank(a.priority) - rank(b.priority)
        || Number(a.calibrationStatus !== "unknown") - Number(b.calibrationStatus !== "unknown")
        || b.score - a.score
        || b.checkpoint.localeCompare(a.checkpoint)
        || a.id.localeCompare(b.id);
    });

  const unknown = rows.filter(row => row.calibrationStatus === "unknown");
  const pass = rows.filter(row => row.calibrationStatus === "confirmed_pass");
  const block = rows.filter(row => row.calibrationStatus === "confirmed_block");
  const payload = {
    generatedAt: date,
    scoreRange: "8-11",
    total: rows.length,
    calibrationPass: pass.length,
    calibrationBlock: block.length,
    calibrationUnknown: unknown.length,
    p0Unknown: unknown.filter(row => row.priority === "P0").length,
    rows,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_threshold_review_queue_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  const lines = [
    "# 企業固有ショック Threshold Review Queue",
    "",
    `生成日: ${date}`,
    "",
    `- score range: 8-11`,
    `- total: ${rows.length}`,
    `- calibration PASS/BLOCK/UNKNOWN: ${pass.length}/${block.length}/${unknown.length}`,
    `- P0 unknown: ${payload.p0Unknown}`,
    "",
    "> score<12はproductionではBLOCKのまま。このqueueは12点という境界を検証するshadow研究専用。",
    "> unknownをPASSへ寄せず、checkpoint以前の一次情報でPASS/BLOCKを明示する。",
    "",
    "## P0/P1 unknown",
    "",
  ];
  if (unknown.length === 0) lines.push("- none");
  else {
    for (const row of unknown.slice(0, 50)) {
      lines.push(`### ${row.priority} ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20)`);
      lines.push(`- id/category/actor: ${row.id} / ${row.category} / ${row.actorType}`);
      lines.push(`- event/checkpoint: ${row.eventDate} / ${row.checkpoint}`);
      lines.push(`- production: ${row.productionStatus}${row.productionBlockers.length ? ` — ${row.productionBlockers.join(" / ")}` : ""}`);
      lines.push(`- calibration: ${row.calibrationStatus}`);
      lines.push(`- missing: ${row.calibrationMissingEvidence.join(" / ") || "-"}`);
      lines.push(`- reaction anchor: ${row.anchorReady ? "replay-ready" : "not ready"}`);
      lines.push(`- existing sources: ${row.sources.length}`);
      for (const action of row.nextActions) lines.push(`  - next: ${action}`);
      lines.push("");
    }
  }

  lines.push("## Explicit shadow PASS", "");
  if (pass.length === 0) lines.push("- none");
  else pass.forEach(row => lines.push(`- ${row.country} ${row.ticker ?? "-"} ${row.company}: ${row.score}/20, anchor=${row.anchorReady ? "ready" : "missing"}`));

  lines.push("", "## Explicit / deterministic shadow BLOCK", "");
  if (block.length === 0) lines.push("- none");
  else block.forEach(row => lines.push(`- ${row.country} ${row.ticker ?? "-"} ${row.company}: ${row.score}/20 — ${row.calibrationBlockers.join(" / ") || "explicit confirmed_block"}`));

  writeFileSync("reports/idiosyncratic_shock_threshold_review_queue_latest.md", lines.join("\n"), "utf-8");
  console.log(`shock threshold review queue: total=${rows.length} pass/block/unknown=${pass.length}/${block.length}/${unknown.length} p0Unknown=${payload.p0Unknown}`);
}

main();
