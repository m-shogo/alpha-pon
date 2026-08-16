// 世界情勢候補仮説の手動評価結果を集計する。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  readWorldThemeCandidateStatsInput,
  type WorldThemeCandidateResultRecord,
} from "./world-theme-candidate-stats-input.js";

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function main(): void {
  const generatedAt = todayJst();
  const input = readWorldThemeCandidateStatsInput("data/world_theme_candidate_review_results.jsonl");
  const rows: WorldThemeCandidateResultRecord[] = input.rows;
  const themes = [...new Set(rows.map(row => row.theme))];
  const byTheme = themes.map(theme => {
    const themeRows = rows.filter(row => row.theme === theme);
    return {
      theme,
      total: themeRows.length,
      resultCounts: countBy(themeRows.map(row => row.result)),
      recent: themeRows.slice(-5),
    };
  }).sort((a, b) => b.total - a.total);
  const inputWarnings = input.warning ? [input.warning] : [];

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/world_theme_candidate_stats_latest.json",
    JSON.stringify({ generatedAt, total: rows.length, byTheme, recent: rows.slice(-20), inputWarnings }, null, 2),
    "utf-8",
  );
  console.log(`world theme candidate stats: total=${rows.length}, themes=${byTheme.length}, warnings=${inputWarnings.length}`);
}

main();
