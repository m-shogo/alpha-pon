import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { buildThresholdDiversityRows } from "./idiosyncratic-shock-threshold-diversity-audit.js";
import { buildThresholdResearchPlan } from "./idiosyncratic-shock-threshold-research-plan.js";

function main(): void {
  const generatedAt = todayJst();
  const plan = buildThresholdResearchPlan(buildThresholdDiversityRows());
  const payload = {
    generatedAt,
    rule: "structural-gap priority only; future outcome fields prohibited",
    deficits: plan.deficits,
    queue: plan.queue,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_threshold_research_plan_latest.json", JSON.stringify(payload, null, 2), "utf-8");

  const lines = [
    "# 企業固有ショック Threshold Research Plan",
    "",
    `生成日: ${generatedAt}`,
    "",
    "> score 8-11の未解決caseを、将来returnではなくthreshold diversityの不足だけで優先順位付けする。",
    "> confirmed BLOCKは件数合わせでqueueへ戻さない。confirmed PASSも再選別しない。",
    "",
    "## Structural deficits",
    "",
    `- replay-ready below12: ${plan.deficits.totalReplayReadyBelow12} missing`,
    `- score10-11: ${plan.deficits.nearBoundary10to11} missing`,
    `- score8-9: ${plan.deficits.deeper8to9} missing`,
    `- distinct categories: ${plan.deficits.distinctCategories} missing`,
    `- JP controls: ${plan.deficits.jpControls} missing`,
    `- US controls: ${plan.deficits.usControls} missing`,
    `- usable shadow 3m outcomes: ${plan.deficits.usable3mBelow12} missing`,
    "",
    "## Prioritized UNKNOWN queue",
    "",
  ];

  if (plan.queue.length === 0) lines.push("- none");
  for (const row of plan.queue) {
    lines.push(`### P${row.priorityScore} ${row.market} ${row.ticker ?? "-"} ${row.company} (${row.score}/20)`);
    lines.push(`- id: ${row.id}`);
    lines.push(`- category/actor: ${row.category} / ${row.actorType}`);
    lines.push(`- reaction anchor replay-ready: ${row.replayReady ? "yes" : "no"}`);
    lines.push(`- why now: ${row.gapReasons.join(" / ") || "general below-threshold research debt"}`);
    lines.push("");
  }

  writeFileSync("reports/idiosyncratic_shock_threshold_research_plan_latest.md", lines.join("\n"), "utf-8");
  console.log(`shock threshold research plan: queue=${plan.queue.length} deepMissing=${plan.deficits.deeper8to9} nearMissing=${plan.deficits.nearBoundary10to11} jpMissing=${plan.deficits.jpControls} usMissing=${plan.deficits.usControls}`);
}

main();
