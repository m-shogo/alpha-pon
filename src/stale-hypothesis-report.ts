import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { staleHypothesisAgeDays } from "./stale-hypothesis-date.js";

type Company = { code: string; name: string; status?: string; lastReviewedAt?: string };
type Config = { categories: Record<string, { label: string; companies: Company[] }> };
type NonMoveHistory = { code?: string; nonMoveReasons?: string[]; outcome?: string };

type NonMoveStats = { count: number; reasons: string[]; topReason: string };

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((item): item is T => item !== null);
}

function nonMoveStatsByCode(): Map<string, NonMoveStats> {
  const rows = readJsonl<NonMoveHistory>("data/company_non_move_history.jsonl");
  const reasonCounts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.code || row.code === "template") continue;
    const map = reasonCounts.get(row.code) ?? new Map<string, number>();
    for (const reason of row.nonMoveReasons ?? ["unknown_or_insufficient_data"]) {
      map.set(reason, (map.get(reason) ?? 0) + 1);
    }
    reasonCounts.set(row.code, map);
  }

  const stats = new Map<string, NonMoveStats>();
  for (const [code, counts] of reasonCounts.entries()) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const count = sorted.reduce((sum, [, value]) => sum + value, 0);
    stats.set(code, { count, reasons: sorted.map(([reason]) => reason), topReason: sorted[0]?.[0] ?? "unknown" });
  }
  return stats;
}

function actionFor(company: Company, stat?: NonMoveStats): string {
  const age = staleHypothesisAgeDays(company.lastReviewedAt);
  if (company.status === "retired") return "retired";
  if (company.status === "stale") return "stale";
  if ((stat?.count ?? 0) >= 3) return "retire_or_rewrite_repeated_miss";
  if ((stat?.count ?? 0) >= 2) return "review_repeated_miss";
  if (age == null) return "missing_review_date";
  if (age >= 365) return "retire_or_rewrite";
  if (age >= 120) return "review_needed";
  return "keep";
}

function main() {
  const date = todayJst();
  const config = load(readFileSync("config/company-hypotheses.yml", "utf-8")) as Config;
  const stats = nonMoveStatsByCode();
  const rows: Array<{ category: string; company: Company; action: string; age: number | null; stat?: NonMoveStats }> = [];

  for (const category of Object.values(config.categories ?? {})) {
    for (const company of category.companies ?? []) {
      const stat = stats.get(company.code);
      const action = actionFor(company, stat);
      if (action !== "keep") rows.push({ category: category.label, company, action, age: staleHypothesisAgeDays(company.lastReviewedAt), stat });
    }
  }

  const lines: string[] = [];
  lines.push("# alpha-pon stale / retired hypothesis report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("DBは増やすだけでは危険です。古い仮説と、同じ理由で外し続ける仮説を review / retire 候補にします。");
  lines.push("");
  lines.push("| action | category | code | name | ageDays | misses | topReason | status |");
  lines.push("|---|---|---|---|---:|---:|---|---|");
  for (const row of rows) {
    lines.push(`| ${row.action} | ${row.category} | ${row.company.code} | ${row.company.name} | ${row.age ?? "N/A"} | ${row.stat?.count ?? 0} | ${row.stat?.topReason ?? "N/A"} | ${row.company.status ?? "active"} |`);
  }
  if (rows.length === 0) lines.push("| ok | all | - | - | 0 | 0 | - | active |");
  lines.push("");
  lines.push("## rule");
  lines.push("- 120日以上レビューなし: review_needed");
  lines.push("- 365日以上レビューなし: retire_or_rewrite");
  lines.push("- 同じ銘柄で外れ理由2回以上: review_repeated_miss");
  lines.push("- 同じ銘柄で外れ理由3回以上: retire_or_rewrite_repeated_miss");
  lines.push("- retired は削除ではなく、見ない理由を残す");
  lines.push("- current regime と合わない銘柄は無理に追わない");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stale_hypotheses_latest.md"), lines.join("\n"), "utf-8");
  console.log(`stale hypotheses: ${rows.length}`);
}

main();
