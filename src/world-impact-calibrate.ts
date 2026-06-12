// pnpm calibrate:world-impact
// confidence帯 / mechanism / lag 別に検証結果（hit/miss/inverse）を集計する。
// 評価サンプルが少ない間は参考値のみ。投資助言ではない。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  buildWorldImpactCalibration,
  loadWorldImpactReviews,
  normalizeWorldImpactReview,
  type WorldEventImpactReview,
  type WorldImpactCalibration,
} from "./world-impact.js";

function readLatest(today: string): WorldEventImpactReview[] {
  const latest = join("data", "world_event_impacts_latest.json");
  if (!existsSync(latest)) return loadWorldImpactReviews();
  try {
    const parsed = JSON.parse(readFileSync(latest, "utf-8"));
    return Array.isArray(parsed) ? parsed.map(item => normalizeWorldImpactReview(item, today)) : [];
  } catch {
    return [];
  }
}

function renderMarkdown(calibration: WorldImpactCalibration): string {
  const lines: string[] = [];
  lines.push("# 世界ニュース影響仮説 キャリブレーション");
  lines.push("");
  lines.push(`生成日: ${calibration.generatedAt}`);
  lines.push(`対象レビュー: ${calibration.totalReviews}件 / 評価済み outcome: ${calibration.evaluatedOutcomes}件`);
  lines.push("");
  for (const note of calibration.notes) lines.push(`> ${note}`);
  lines.push("");
  for (const groupType of ["confidence", "mechanism", "lag"] as const) {
    const rows = calibration.rows.filter(row => row.groupType === groupType);
    lines.push(`## ${groupType} 別`);
    lines.push("");
    if (rows.length === 0) {
      lines.push("- データなし");
    } else {
      lines.push("| グループ | outcome数 | 評価済み | 整合 | 差分 | 逆行 | 整合率 | 備考 |");
      lines.push("|---|---:|---:|---:|---:|---:|---:|---|");
      for (const row of rows.sort((a, b) => b.total - a.total)) {
        const rate = row.hitRate != null ? `${(row.hitRate * 100).toFixed(0)}%` : "-";
        lines.push(`| ${row.groupKey} | ${row.total} | ${row.evaluated} | ${row.hit} | ${row.miss} | ${row.inverse} | ${rate} | ${row.sampleTooSmall ? "サンプル不足" : "参考値"} |`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const today = todayJst();
  const reviews = readLatest(today);
  const calibration = buildWorldImpactCalibration(reviews, today);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "world-impact-calibration.json"), JSON.stringify(calibration, null, 2) + "\n");
  writeFileSync(join("reports", "world-impact-calibration.md"), renderMarkdown(calibration));

  console.log(`\n=== world impact calibration (${today}) ===`);
  console.log(`totalReviews: ${calibration.totalReviews}`);
  console.log(`evaluatedOutcomes: ${calibration.evaluatedOutcomes}`);
  console.log(`groups: ${calibration.rows.length}`);
  console.log("出力: reports/world-impact-calibration.md / reports/world-impact-calibration.json");
}

main();
