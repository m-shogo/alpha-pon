// Morning Lite改善レポート。通知量・失敗ステップ・ノイズを見て翌改善に回す。

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  parseMorningLiteDedupeFileDate,
  readMorningLiteDedupeCount,
  readMorningLitePipelineInput,
} from "./morning-lite-pipeline-input.js";

function recentNotificationCounts(asOf: string): {
  counts: Array<{ date: string; count: number }>;
  warnings: string[];
} {
  const dir = "data/notification-dedupe";
  if (!existsSync(dir)) return { counts: [], warnings: [] };
  const warnings: string[] = [];
  const datedFiles = readdirSync(dir)
    .map(name => ({ name, parsed: parseMorningLiteDedupeFileDate(name, asOf) }))
    .filter(item => {
      if (item.parsed.warning) warnings.push(item.parsed.warning);
      return item.parsed.date !== null;
    })
    .sort((a, b) => (a.parsed.date ?? "").localeCompare(b.parsed.date ?? ""))
    .slice(-7);

  const counts = datedFiles.map(item => {
    const path = join(dir, item.name);
    const loaded = readMorningLiteDedupeCount(path);
    if (loaded.warning) warnings.push(loaded.warning);
    return {
      date: item.parsed.date as string,
      count: loaded.count,
    };
  });
  return { counts, warnings };
}

function recommendation(count: number, failedSteps: string[]): string[] {
  const items: string[] = [];
  if (count > 8) items.push("通知が多い。Lite通知の上限・テーマ重複・キーワードを絞る。");
  if (count === 0) items.push("通知が少ない。重要イベント日付とworld_events_latest.jsonの生成状況を確認する。");
  if (failedSteps.length > 0) items.push(`失敗ステップを先に直す: ${failedSteps.join(" / ")}`);
  if (items.length === 0) items.push("通知量は適正。次は重複率と実際に読んだ価値を確認する。");
  return items;
}

function main(): void {
  const today = todayJst();
  const notificationInput = recentNotificationCounts(today);
  const counts = notificationInput.counts;
  const todayCount = counts.find(row => row.date === today)?.count ?? 0;
  const pipeline = readMorningLitePipelineInput("reports/pipeline_status_latest.json");
  const failedSteps = pipeline.failedSteps;
  const actions = recommendation(todayCount, failedSteps);
  const inputWarnings = [pipeline.warning, ...notificationInput.warnings]
    .filter((warning): warning is string => warning !== null);

  const lines = [
    "# Alpha Pon Morning Lite 改善レポート",
    "",
    `date: ${today}`,
    "",
    "## summary",
    "",
    `- 今日の通知数: ${todayCount}`,
    `- pipeline: ${pipeline.status}`,
    `- failedSteps: ${failedSteps.length > 0 ? failedSteps.join(" / ") : "なし"}`,
    ...(inputWarnings.length > 0 ? ["", "## input warnings", "", ...inputWarnings.map(warning => `- ${warning}`)] : []),
    "",
    "## recent notification counts",
    "",
    ...counts.map(row => `- ${row.date}: ${row.count}`),
    "",
    "## next improvements",
    "",
    ...actions.map(item => `- ${item}`),
    "",
    "> 売買推奨ではなく、重要な変化を見逃さない情報秘書として改善する。",
  ];

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/morning_lite_improvement_latest.md", lines.join("\n"), "utf-8");
  console.log(`Morning Lite改善レポート: reports/morning_lite_improvement_latest.md (${todayCount}件)`);
}

main();
