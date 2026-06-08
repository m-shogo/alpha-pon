import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { buildOutcomeIntegrityReport, type OutcomeIntegrityReport } from "./hypothesis-outcome-integrity.js";

function renderMarkdown(report: OutcomeIntegrityReport): string {
  const lines: string[] = [];
  lines.push("# hypothesis outcome integrity", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push(`status: **${report.status}**`, "");
  lines.push("> ※売買推奨ではありません。仮説検証データの整合性診断です。", "");
  lines.push("## summary", "");
  lines.push("| source | rows | duplicate groups | unique index |");
  lines.push("|---|---:|---:|---|");
  lines.push(`| jsonl | ${report.jsonl.totalRows} | ${report.jsonl.duplicateGroups.length} | - |`);
  lines.push(`| sqlite | ${report.sqlite.totalRows ?? "-"} | ${report.sqlite.duplicateGroups.length} | ${report.sqlite.uniqueIndexExists ? "yes" : "no"} |`);
  lines.push("");

  const allDuplicates = [...report.jsonl.duplicateGroups, ...report.sqlite.duplicateGroups];
  if (allDuplicates.length > 0) {
    lines.push("## duplicates", "");
    lines.push("| key | count |");
    lines.push("|---|---:|");
    for (const duplicate of allDuplicates.slice(0, 30)) {
      lines.push(`| ${duplicate.key} | ${duplicate.count} |`);
    }
    lines.push("");
  }

  if (report.sqlite.error) {
    lines.push("## sqlite error", "");
    lines.push(`- ${report.sqlite.error}`, "");
  }

  lines.push("## next action", "");
  lines.push(`- ${report.nextAction}`, "");
  lines.push("## notes", "");
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const report = buildOutcomeIntegrityReport({ generatedAt: todayJst() });
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "hypothesis_outcome_integrity_latest.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join("reports", "hypothesis_outcome_integrity_latest.md"), renderMarkdown(report), "utf-8");

  console.log("=== hypothesis outcome integrity ===");
  console.log(`status: ${report.status}`);
  console.log(`jsonl rows: ${report.jsonl.totalRows}`);
  console.log(`jsonl duplicate groups: ${report.jsonl.duplicateGroups.length}`);
  console.log(`sqlite rows: ${report.sqlite.totalRows ?? "-"}`);
  console.log(`sqlite unique index: ${report.sqlite.uniqueIndexExists ? "yes" : "no"}`);
  console.log(`sqlite duplicate groups: ${report.sqlite.duplicateGroups.length}`);
  console.log(`nextAction: ${report.nextAction}`);
  if (report.status === "duplicate_found") process.exitCode = 1;
}

main();
