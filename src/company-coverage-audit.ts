import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { normalizeCompanyCoverageRoots } from "./company-coverage-input.js";

type HypCompany = { code: string; name: string; status?: string };
type Hypotheses = { categories: Record<string, { label: string; companies?: HypCompany[] }> };
type Network = { companies: Record<string, { name: string; categoryHints?: string[] }> };

function main() {
  const date = todayJst();
  const hypothesesRaw = load(readFileSync("config/company-hypotheses.yml", "utf-8"));
  const networkRaw = load(readFileSync("config/company-network.yml", "utf-8"));
  const roots = normalizeCompanyCoverageRoots(hypothesesRaw, networkRaw);
  const hypotheses = (roots.hypotheses ?? { categories: {} }) as Hypotheses;
  const network = (roots.network ?? { companies: {} }) as Network;

  const hypothesisCodes = new Map<string, { name: string; categories: string[]; status?: string }>();
  for (const [categoryId, category] of Object.entries(hypotheses.categories ?? {})) {
    for (const company of category.companies ?? []) {
      if (!company.code || company.code === "generic") continue;
      const current = hypothesisCodes.get(company.code) ?? { name: company.name, categories: [], status: company.status };
      current.categories.push(categoryId);
      hypothesisCodes.set(company.code, current);
    }
  }

  const networkCodes = new Map(Object.entries(network.companies ?? {}));
  const hypothesisMissingNetwork = [...hypothesisCodes.entries()].filter(([code]) => !networkCodes.has(code));
  const networkMissingHypothesis = [...networkCodes.entries()].filter(([code]) => !hypothesisCodes.has(code));

  const lines: string[] = [];
  lines.push("# alpha-pon company coverage audit");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("company-hypotheses.yml と company-network.yml の未接続を検出します。買い推奨ではありません。");
  lines.push("");

  lines.push("## summary");
  lines.push("");
  lines.push(`- health status: ${roots.warnings.length === 0 ? "ok" : "action_required"}`);
  lines.push(`- input warnings: ${roots.warnings.length}`);
  lines.push(`- hypothesis companies: ${hypothesisCodes.size}`);
  lines.push(`- network companies: ${networkCodes.size}`);
  lines.push(`- hypothesis missing network: ${hypothesisMissingNetwork.length}`);
  lines.push(`- network missing hypothesis: ${networkMissingHypothesis.length}`);
  lines.push("");

  lines.push("## input warnings");
  lines.push("");
  if (roots.warnings.length === 0) lines.push("- none");
  for (const warning of roots.warnings) lines.push(`- ${warning}`);
  lines.push("");

  lines.push("## warning: hypothesis exists but network is missing");
  lines.push("");
  if (hypothesisMissingNetwork.length === 0) lines.push("- none");
  for (const [code, item] of hypothesisMissingNetwork) {
    lines.push(`- ${code} ${item.name}: categories=${item.categories.join("/")} status=${item.status ?? "active"}`);
  }
  lines.push("");

  lines.push("## caution: network exists but hypothesis is missing");
  lines.push("");
  if (networkMissingHypothesis.length === 0) lines.push("- none");
  for (const [code, item] of networkMissingHypothesis) {
    lines.push(`- ${code} ${item.name}: categoryHints=${(item.categoryHints ?? []).join("/") || "N/A"}`);
  }
  lines.push("");

  lines.push("## rule");
  lines.push("- hypothesisにある銘柄は、原則company-networkにも登録して関連会社・競合を確認する");
  lines.push("- networkにだけある銘柄は、具体仮説にする必要があるか、周辺候補のままでよいか判断する");
  lines.push("- 無理に銘柄化しない。必要なければ、周辺監視または追わないにする");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "company_coverage_audit_latest.md"), lines.join("\n"), "utf-8");
  console.log(`company coverage audit: hyp=${hypothesisCodes.size} network=${networkCodes.size}`);
}

main();
