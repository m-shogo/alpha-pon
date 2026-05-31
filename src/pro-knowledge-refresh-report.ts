import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type RefreshDomain = {
  id: string;
  label: string;
  reviewCadence: "weekly" | "monthly" | string;
  why: string;
  affectedAgents?: string[];
  watchExamples?: string[];
  mustUpdateWhen?: string[];
};

type RefreshConfig = {
  refreshDomains?: RefreshDomain[];
  refreshRules?: string[];
  outputRequirements?: string[];
};

type CurrentRegime = {
  asOf?: string;
  summary?: string;
  activeRegimes?: Array<{ id: string; level?: string; watchCategories?: string[]; caution?: string[] }>;
};

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function domainPriority(domain: RefreshDomain, regime: CurrentRegime): "S" | "A" | "B" {
  const text = `${regime.summary ?? ""} ${(regime.activeRegimes ?? []).map(r => r.id).join(" ")}`.toLowerCase();
  const id = domain.id.toLowerCase();
  if (text.includes(id) || (id.includes("ai") && text.includes("ai")) || (id.includes("rates") && text.includes("rate"))) return "S";
  if (domain.reviewCadence === "weekly") return "A";
  return "B";
}

function main() {
  const date = todayJst();
  const config = readYaml<RefreshConfig>("config/pro-knowledge-refresh.yml", {});
  const regime = readYaml<CurrentRegime>("config/current-regime.yml", {});
  const domains = config.refreshDomains ?? [];

  const lines: string[] = [];
  lines.push("# alpha-pon Pro知識ブラッシュアップレポート");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("政治・戦争・AI・宇宙/Starlink・気候・食糧・金利などで、Proエージェントの前提を更新すべき領域を出します。買い推奨ではありません。");
  lines.push("");
  lines.push("## current regime context");
  lines.push("");
  lines.push(`- asOf: ${regime.asOf ?? "N/A"}`);
  lines.push(`- summary: ${regime.summary ?? "N/A"}`);
  for (const item of regime.activeRegimes ?? []) lines.push(`- active: ${item.id} / level=${item.level ?? "N/A"}`);
  lines.push("");

  lines.push("## refresh queue");
  lines.push("");
  lines.push("| priority | domain | cadence | affectedAgents | why |");
  lines.push("|---|---|---|---|---|");
  for (const domain of domains) {
    lines.push(`| ${domainPriority(domain, regime)} | ${domain.id} / ${domain.label} | ${domain.reviewCadence} | ${(domain.affectedAgents ?? []).join(", ")} | ${domain.why} |`);
  }
  lines.push("");

  for (const domain of domains) {
    lines.push(`## ${domainPriority(domain, regime)} ${domain.label} (${domain.id})`);
    lines.push("");
    lines.push(`- cadence: ${domain.reviewCadence}`);
    lines.push(`- why: ${domain.why}`);
    lines.push(`- affected agents: ${(domain.affectedAgents ?? []).join(", ") || "N/A"}`);
    lines.push("- watch examples:");
    for (const item of domain.watchExamples ?? []) lines.push(`  - ${item}`);
    lines.push("- must update when:");
    for (const item of domain.mustUpdateWhen ?? []) lines.push(`  - ${item}`);
    lines.push("- action:");
    lines.push("  - current-regime.yml の前提に反映するべき変化がないか確認");
    lines.push("  - company-hypotheses.yml の対象カテゴリ/銘柄が古くなっていないか確認");
    lines.push("  - stock-pro-agents.yml の must_check / reject_when に追加すべき観点がないか確認");
    lines.push("  - テーマだけで銘柄化せず、収益・契約・一次情報への接続を確認");
    lines.push("");
  }

  lines.push("## refresh rules");
  lines.push("");
  for (const rule of config.refreshRules ?? []) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("## output requirements");
  lines.push("");
  for (const req of config.outputRequirements ?? []) lines.push(`- ${req}`);
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon pro knowledge refresh | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "pro_knowledge_refresh_latest.md"), lines.join("\n"), "utf-8");
  console.log("pro knowledge refresh report generated");
}

main();
