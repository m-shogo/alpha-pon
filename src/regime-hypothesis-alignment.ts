import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type CurrentRegime = {
  activeRegimes?: Array<{ id: string; level: string; watchCategories?: string[] }>;
};

type Company = { code: string; name: string; status?: string };
type Hypotheses = { categories: Record<string, { label: string; thesis?: string; companies?: Company[] }> };

function main() {
  const date = todayJst();
  const regime = load(readFileSync("config/current-regime.yml", "utf-8")) as CurrentRegime;
  const hypotheses = load(readFileSync("config/company-hypotheses.yml", "utf-8")) as Hypotheses;
  const activeCategories = new Set((regime.activeRegimes ?? []).flatMap(item => item.watchCategories ?? []));
  const allCategories = Object.keys(hypotheses.categories ?? {});

  const activeButThin = allCategories
    .filter(categoryId => activeCategories.has(categoryId))
    .map(categoryId => ({ categoryId, category: hypotheses.categories[categoryId], count: hypotheses.categories[categoryId]?.companies?.length ?? 0 }))
    .filter(row => row.count === 0);

  const inactiveWithActiveCompanies = allCategories
    .filter(categoryId => !activeCategories.has(categoryId))
    .map(categoryId => ({
      categoryId,
      category: hypotheses.categories[categoryId],
      companies: (hypotheses.categories[categoryId]?.companies ?? []).filter(company => company.status !== "retired"),
    }))
    .filter(row => row.companies.length > 0);

  const activeWithCompanies = allCategories
    .filter(categoryId => activeCategories.has(categoryId))
    .map(categoryId => ({
      categoryId,
      category: hypotheses.categories[categoryId],
      companies: (hypotheses.categories[categoryId]?.companies ?? []).filter(company => company.status !== "retired"),
    }));

  const lines: string[] = [];
  lines.push("# alpha-pon regime / hypothesis alignment report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("現在情勢DBと具体銘柄仮説DBのズレを検出します。買い推奨ではありません。");
  lines.push("");

  lines.push("## active regime categories");
  lines.push("");
  if (activeCategories.size === 0) lines.push("- N/A");
  for (const categoryId of activeCategories) lines.push(`- ${categoryId}`);
  lines.push("");

  lines.push("## active categories with companies");
  lines.push("");
  if (activeWithCompanies.length === 0) lines.push("- active category に紐づく銘柄仮説がありません。");
  for (const row of activeWithCompanies) {
    lines.push(`- ${row.categoryId} ${row.category?.label ?? ""}: ${row.companies.length} companies`);
  }
  lines.push("");

  lines.push("## warning: active but thin");
  lines.push("");
  if (activeButThin.length === 0) lines.push("- 監視対象なのに銘柄仮説が空のカテゴリはありません。");
  for (const row of activeButThin) lines.push(`- ${row.categoryId} ${row.category?.label ?? ""}: companies=0`);
  lines.push("");

  lines.push("## caution: inactive categories still carrying active companies");
  lines.push("");
  if (inactiveWithActiveCompanies.length === 0) lines.push("- current regime 外で active companies を持つカテゴリはありません。");
  for (const row of inactiveWithActiveCompanies) {
    lines.push(`### ${row.categoryId} ${row.category?.label ?? ""}`);
    lines.push("- caution: 今の情勢DBでは監視対象外です。無理に追わず、保留/追わない判断を検討します。");
    for (const company of row.companies.slice(0, 12)) lines.push(`  - ${company.code} ${company.name} (${company.status ?? "active"})`);
  }
  lines.push("");

  lines.push("## rule");
  lines.push("- current regime 外のカテゴリは、強い一次情報がない限り追わない/保留を優先する");
  lines.push("- active regime なのに銘柄仮説が薄いカテゴリは、無理に銘柄化せずテーマ監視でよい");
  lines.push("- active regime は毎月見直す。年次では全面棚卸しする");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "regime_hypothesis_alignment_latest.md"), lines.join("\n"), "utf-8");
  console.log(`regime hypothesis alignment: active=${activeCategories.size}`);
}

main();
