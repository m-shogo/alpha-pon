import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type Company = { code: string; name: string; status?: string; lastReviewedAt?: string };
type Config = { categories: Record<string, { label: string; companies: Company[] }> };

function ageDays(dateText?: string): number | null {
  if (!dateText) return null;
  const time = new Date(`${dateText}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86400000);
}

function actionFor(company: Company): string {
  const age = ageDays(company.lastReviewedAt);
  if (company.status === "retired") return "retired";
  if (company.status === "stale") return "stale";
  if (age == null) return "missing_review_date";
  if (age >= 365) return "retire_or_rewrite";
  if (age >= 120) return "review_needed";
  return "keep";
}

function main() {
  const date = todayJst();
  const config = load(readFileSync("config/company-hypotheses.yml", "utf-8")) as Config;
  const rows: Array<{ category: string; company: Company; action: string; age: number | null }> = [];

  for (const category of Object.values(config.categories ?? {})) {
    for (const company of category.companies ?? []) {
      const action = actionFor(company);
      if (action !== "keep") rows.push({ category: category.label, company, action, age: ageDays(company.lastReviewedAt) });
    }
  }

  const lines: string[] = [];
  lines.push("# alpha-pon stale / retired hypothesis report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("DBは増やすだけでは危険です。古い仮説は review_needed / retire_or_rewrite / stale / retired に分けます。");
  lines.push("");
  lines.push("| action | category | code | name | ageDays | status |");
  lines.push("|---|---|---|---|---:|---|");
  for (const row of rows) {
    lines.push(`| ${row.action} | ${row.category} | ${row.company.code} | ${row.company.name} | ${row.age ?? "N/A"} | ${row.company.status ?? "active"} |`);
  }
  if (rows.length === 0) lines.push("| ok | all | - | - | 0 | active |");
  lines.push("");
  lines.push("## rule");
  lines.push("- 120日以上レビューなし: review_needed");
  lines.push("- 365日以上レビューなし: retire_or_rewrite");
  lines.push("- retired は削除ではなく、見ない理由を残す");
  lines.push("- current regime と合わない銘柄は無理に追わない");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stale_hypotheses_latest.md"), lines.join("\n"), "utf-8");
  console.log(`stale hypotheses: ${rows.length}`);
}

main();
