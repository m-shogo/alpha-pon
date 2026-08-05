// 企業固有ショック過去事例DBの人間向け一覧をYAML正本から生成する。
// 手書き件数の陳腐化を防ぎ、追加した expansion_*.yml も自動反映する。
// pnpm report:shock-casebook

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import type { HistoricalShockCase } from "./idiosyncratic-shock.js";

function esc(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function bucket(score: number): string {
  if (score >= 16) return "research_priority";
  if (score >= 12) return "watch";
  if (score >= 8) return "caution";
  return "avoid";
}

function groupByCategory(cases: HistoricalShockCase[]): Array<[string, HistoricalShockCase[]]> {
  const groups = new Map<string, HistoricalShockCase[]>();
  for (const item of cases) {
    const rows = groups.get(item.category) ?? [];
    rows.push(item);
    groups.set(item.category, rows);
  }
  return [...groups.entries()]
    .map(([category, rows]) => [category, rows.sort((a, b) => b.eventDate.localeCompare(a.eventDate))] as [string, HistoricalShockCase[]])
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

export function renderShockCasebook(cases: HistoricalShockCase[], generatedAt: string): string {
  const high = cases.filter(item => item.score >= 16).length;
  const watch = cases.filter(item => item.score >= 12 && item.score < 16).length;
  const caution = cases.filter(item => item.score >= 8 && item.score < 12).length;
  const avoid = cases.filter(item => item.score < 8).length;
  const highConfidence = cases.filter(item => item.researchConfidence === "high").length;

  const lines = [
    "# 企業固有ショック 過去事例ケースブック（自動生成）",
    "",
    `生成日: ${generatedAt}`,
    "",
    "> 正本は `data/idiosyncratic_shock_cases.yml` と `data/idiosyncratic_shock_cases_expansion_*.yml`。この一覧はloaderから自動生成します。",
    "> scoreは当時のdecision checkpointで判断可能だった情報を基準にし、後日のoutcomeは別列です。買い推奨ではありません。",
    "",
    "## サマリー",
    "",
    `- cases: **${cases.length}**`,
    `- 16–20 research_priority: ${high}`,
    `- 12–15 watch: ${watch}`,
    `- 8–11 caution: ${caution}`,
    `- 0–7 avoid: ${avoid}`,
    `- high-confidence: ${highConfidence}`,
    "",
    "## 全事例",
    "",
    "| # | company | ticker | date | category | actor | score | bucket | confidence | checkpoint | outcome | lesson |",
    "|---:|---|---|---|---|---|---:|---|---|---|---|---|",
  ];

  const ordered = [...cases].sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.score - a.score || a.company.localeCompare(b.company));
  ordered.forEach((item, index) => {
    lines.push(`| ${index + 1} | ${esc(item.company)} | ${item.ticker ?? "-"} | ${item.eventDate} | ${item.category} | ${item.actorType} | ${item.score} | ${bucket(item.score)} | ${item.researchConfidence} | ${item.decisionCheckpoint} | ${item.outcome?.recoveryPattern ?? "unknown"} | ${esc(item.outcome?.summary ?? "-")} |`);
  });

  lines.push("", "## category別", "");
  for (const [category, rows] of groupByCategory(cases)) {
    const avg = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
    lines.push(`### ${category} (${rows.length})`);
    lines.push(`- avg score: ${avg.toFixed(1)}`);
    lines.push(`- >=12: ${rows.filter(row => row.score >= 12).length}`);
    lines.push(`- failed outcome: ${rows.filter(row => row.outcome?.recoveryPattern === "failed").length}`);
    lines.push(`- cases: ${rows.slice(0, 12).map(row => `${row.company}(${row.score})`).join(" / ")}`);
    lines.push("");
  }

  lines.push("## 読み方", "");
  lines.push("- 高scoreは『恒久的実害が限定的かもしれない』という調査優先度であり、将来リターンの保証ではありません。");
  lines.push("- 会計・品質・規制・組織問題は、下落率が大きくても負例として保持します。");
  lines.push("- outcomeは当時scoreに逆流させず、12点閾値の後日検証にだけ利用します。");
  lines.push("- 最新の通知hard gateは `docs/idiosyncratic-shock-playbook.md` を参照してください。");
  return lines.join("\n");
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const markdown = renderShockCasebook(cases, date);
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_casebook_latest.md", markdown, "utf-8");
  writeFileSync("reports/idiosyncratic_shock_casebook_latest.json", JSON.stringify({ generatedAt: date, count: cases.length, cases }, null, 2), "utf-8");
  console.log(`shock casebook: ${cases.length} cases`);
}

main();
