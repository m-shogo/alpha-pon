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

const GROUP_LABELS: Record<string, string> = {
  confidence: "confidence帯",
  mechanism: "mechanism",
  lag: "lag（horizon）",
  direction: "direction",
  source: "source reliability",
  code: "銘柄",
  theme: "テーマ",
};

function renderMarkdown(calibration: WorldImpactCalibration): string {
  const lines: string[] = [];
  lines.push("# 世界ニュース影響仮説 キャリブレーション");
  lines.push("");
  lines.push(`生成日: ${calibration.generatedAt}`);
  lines.push(`対象レビュー: ${calibration.totalReviews}件 / 評価済み outcome: ${calibration.evaluatedOutcomes}件`);
  lines.push("");
  for (const note of calibration.notes) lines.push(`> ${note}`);
  lines.push("");
  for (const groupType of ["confidence", "mechanism", "lag", "direction", "source", "code", "theme"] as const) {
    const rows = calibration.rows.filter(row => row.groupType === groupType);
    lines.push(`## ${GROUP_LABELS[groupType]} 別`);
    lines.push("");
    if (rows.length === 0) {
      lines.push("- データなし");
    } else {
      lines.push("| グループ | outcome数 | 評価済み | 整合 | 差分 | 逆行 | 判定不能 | データ不足 | 整合率 | 備考 |");
      lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
      for (const row of rows.sort((a, b) => b.total - a.total).slice(0, 20)) {
        const rate = row.hitRate != null ? `${(row.hitRate * 100).toFixed(0)}%` : "-";
        lines.push(`| ${row.groupKey} | ${row.total} | ${row.evaluated} | ${row.hit} | ${row.miss} | ${row.inverse} | ${row.unclear} | ${row.insufficientData} | ${rate} | ${row.sampleTooSmall ? "サンプル不足" : "参考値"} |`);
      }
    }
    lines.push("");
  }

  lines.push("## High Confidence Misses（confidence 過大の候補）");
  lines.push("");
  if (calibration.highConfidenceMisses.length === 0) {
    lines.push("- なし");
  } else {
    for (const item of calibration.highConfidenceMisses.slice(0, 15)) {
      lines.push(`- ${item.code} ${item.horizon}: ${item.topic.slice(0, 50)} / confidence=${item.confidence} / result=${item.result}${item.autoMissReason ? ` / auto=${item.autoMissReason}` : ""}`);
    }
  }
  lines.push("");
  lines.push("## Low Confidence Hits（confidence 過小の候補）");
  lines.push("");
  if (calibration.lowConfidenceHits.length === 0) {
    lines.push("- なし");
  } else {
    for (const item of calibration.lowConfidenceHits.slice(0, 15)) {
      lines.push(`- ${item.code} ${item.horizon}: ${item.topic.slice(0, 50)} / confidence=${item.confidence}`);
    }
  }
  lines.push("");

  lines.push("## 外れ理由ランキング");
  lines.push("");
  const autoEntries = Object.entries(calibration.autoMissReasonCounts).sort((a, b) => b[1] - a[1]);
  const manualEntries = Object.entries(calibration.manualMissReasonCounts).sort((a, b) => b[1] - a[1]);
  if (autoEntries.length === 0 && manualEntries.length === 0) {
    lines.push("- 記録なし");
  } else {
    for (const [reason, count] of autoEntries) lines.push(`- auto: ${reason} = ${count}件`);
    for (const [reason, count] of manualEntries) lines.push(`- manual: ${reason} = ${count}件`);
  }
  lines.push("");

  lines.push("## 次回から confidence を下げるべき条件（候補）");
  lines.push("");
  for (const item of calibration.suggestions.weaken) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## 次回から confidence を上げてもよい条件（候補）");
  lines.push("");
  for (const item of calibration.suggestions.strengthen) lines.push(`- ${item}`);
  lines.push("");
  lines.push("> 候補はルールベースの観察結果です。断定や売買の推奨ではありません。");
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
