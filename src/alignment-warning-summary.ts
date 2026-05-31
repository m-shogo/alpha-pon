import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function main() {
  const date = todayJst();
  const report = readText("reports/regime_hypothesis_alignment_latest.md");
  const lines: string[] = [];
  const warnings: string[] = [];

  if (!report) {
    warnings.push("regime_hypothesis_alignment_latest.md が未生成です。情勢と銘柄仮説のズレ確認が弱いです。");
  } else {
    for (const line of report.split("\n")) {
      if (line.includes("caution:") || line.includes("監視対象外") || line.includes("companies=0")) {
        warnings.push(line.replace(/^[-#\s]+/, ""));
      }
    }
  }

  lines.push("# alpha-pon alignment warning summary");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("current-regime と company-hypotheses のズレ要約です。買い推奨ではありません。");
  lines.push("");
  if (warnings.length === 0) {
    lines.push("- 大きなズレ警告はありません。");
  } else {
    for (const warning of [...new Set(warnings)].slice(0, 20)) lines.push(`- ${warning}`);
  }
  lines.push("");
  lines.push("## rule");
  lines.push("- current regime 外のカテゴリは、強い一次情報がない限り追わない/保留を優先する");
  lines.push("- 監視対象なのに銘柄仮説が薄いカテゴリは、無理に銘柄化せずテーマ監視に留める");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "alignment_warning_summary_latest.md"), lines.join("\n"), "utf-8");
  console.log(`alignment warning summary: ${warnings.length}`);
}

main();
