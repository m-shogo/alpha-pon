import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { normalizeCompanyHypothesesRoot } from "./company-coverage-input.js";
import { todayJst } from "./date.js";

type CompanyHypothesis = {
  code: string;
  name: string;
  role: string;
  status: string;
  upsideHypothesis: string;
  noMoveHypothesis: string;
  downsideHypothesis: string;
  notGoodWhen?: string[];
  relatedCompanies?: string[];
  evidenceToCheck?: string[];
  nonMoveReasonCandidates?: string[];
  lastReviewedAt?: string;
};

type Category = {
  label: string;
  thesis: string;
  companies: CompanyHypothesis[];
};

function readConfig(): { categories: Record<string, Category>; warning: string | null } {
  const path = join(process.cwd(), "config", "company-hypotheses.yml");
  const raw = load(readFileSync(path, "utf-8"));
  const input = normalizeCompanyHypothesesRoot(raw);
  return {
    categories: (input.categories ?? {}) as Record<string, Category>,
    warning: input.warning,
  };
}

function statusIcon(status: string): string {
  if (status === "active") return "🟢";
  if (status === "watch") return "🟡";
  if (status === "stale") return "⚪";
  if (status === "retired") return "⚫";
  return "🔎";
}

function main() {
  const date = todayJst();
  const config = readConfig();
  const lines: string[] = [];
  lines.push("# alpha-pon 具体銘柄 仮説DBレポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> テーマ別に、具体銘柄・親会社/関連会社・上がる仮説・上がらない仮説・下がる仮説を蓄積するためのレポートです。買い推奨ではありません。");
  lines.push("");
  lines.push("## input health");
  lines.push("");
  lines.push(`- health status: ${config.warning ? "action_required" : "ok"}`);
  lines.push(`- warning: ${config.warning ?? "none"}`);
  lines.push("");

  for (const [categoryId, category] of Object.entries(config.categories)) {
    lines.push(`## ${category.label} (${categoryId})`);
    lines.push("");
    lines.push(`- テーマ仮説: ${category.thesis}`);
    lines.push("");

    for (const company of category.companies ?? []) {
      lines.push(`### ${statusIcon(company.status)} ${company.code} ${company.name}`);
      lines.push(`- 役割: ${company.role}`);
      lines.push(`- status: ${company.status}`);
      lines.push(`- 上がる仮説: ${company.upsideHypothesis}`);
      lines.push(`- 上がらない仮説: ${company.noMoveHypothesis}`);
      lines.push(`- 下がる仮説: ${company.downsideHypothesis}`);
      lines.push(`- 最終確認日: ${company.lastReviewedAt ?? "N/A"}`);
      lines.push("- ダメ条件:");
      (company.notGoodWhen ?? ["N/A"]).forEach(item => lines.push(`  - ${item}`));
      lines.push("- 親会社・関連会社・競合候補:");
      (company.relatedCompanies ?? ["N/A"]).forEach(item => lines.push(`  - ${item}`));
      lines.push("- 一次情報/財務で確認すること:");
      (company.evidenceToCheck ?? ["N/A"]).forEach(item => lines.push(`  - ${item}`));
      lines.push("- 外れた時に保存する理由DB候補:");
      (company.nonMoveReasonCandidates ?? ["unknown_or_insufficient_data"]).forEach(item => lines.push(`  - ${item}`));
      lines.push("");
    }
  }

  lines.push("## 運用ルール");
  lines.push("");
  lines.push("- これは買いリストではなく、調査仮説DB");
  lines.push("- 1社に拘らず、同じテーマ内で候補群を横比較する");
  lines.push("- 上がる仮説より、上がらない仮説・下がる仮説を必ず確認する");
  lines.push("- 外れたら non-move reason taxonomy に保存する");
  lines.push("- lastReviewedAt が古い仮説は stale 扱いを検討する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon company hypotheses | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "company_hypotheses_latest.md"), lines.join("\n"), "utf-8");
  console.log("company hypotheses report generated");
}

if (!existsSync(join(process.cwd(), "config", "company-hypotheses.yml"))) {
  console.error("config/company-hypotheses.yml not found");
  process.exit(1);
}

main();
