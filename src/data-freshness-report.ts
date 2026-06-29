// 主要レポートの鮮度を見える化する。古い情報を通知に使っていないか確認する。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { freshnessSummary } from "./data-freshness.js";

const TARGETS = [
  { path: "reports/world_events_latest.json", label: "世界ニュース" },
  { path: "reports/latest.md", label: "銘柄朝刊" },
  { path: "reports/pipeline_status_latest.json", label: "pipeline status" },
];

function main(): void {
  const today = todayJst();
  const results = freshnessSummary(TARGETS);
  const stale = results.filter(result => !result.isFreshToday);

  const lines = [
    "# Alpha Pon データ鮮度レポート",
    "",
    `date: ${today}`,
    "",
    "## summary",
    "",
    `- checked: ${results.length}`,
    `- staleOrMissing: ${stale.length}`,
    "",
    "## details",
    "",
    ...results.map(result => [
      `### ${result.label}`,
      `- status: ${result.isFreshToday ? "ok" : "stale"}`,
      `- path: ${result.path}`,
      `- updatedDateJst: ${result.updatedDateJst ?? "-"}`,
      `- reason: ${result.reason}`,
      "",
    ].join("\n")),
    "---",
    "※古いデータは新着扱いで通知しない。売買推奨ではありません。",
  ];

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/data_freshness_latest.md", lines.join("\n"), "utf-8");
  console.log(`データ鮮度レポート: reports/data_freshness_latest.md stale=${stale.length}`);
}

main();
