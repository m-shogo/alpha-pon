import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { normalizeCompanyNetworkReportRows, normalizeCompanyNetworkRoot } from "./company-coverage-input.js";
import { todayJst } from "./date.js";

function main() {
  const date = todayJst();
  const raw = load(readFileSync("config/company-network.yml", "utf-8"));
  const input = normalizeCompanyNetworkRoot(raw);
  const normalized = normalizeCompanyNetworkReportRows(input);
  const companies = normalized.companies;
  const lines: string[] = [];
  lines.push("# alpha-pon company network report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("1社だけに拘らず、関連会社・競合・需要ドライバー・better peer riskを確認します。買い推奨ではありません。");
  lines.push("");
  lines.push("## input health");
  lines.push("");
  lines.push(`- health status: ${normalized.warnings.length > 0 ? "action_required" : "ok"}`);
  lines.push(`- input warnings: ${normalized.warnings.length}`);
  if (normalized.warnings.length === 0) lines.push("- warning: none");
  for (const warning of normalized.warnings) lines.push(`- warning: ${warning}`);
  lines.push("");

  for (const [code, company] of Object.entries(companies)) {
    lines.push(`## ${code} ${company.name}`);
    lines.push(`- category: ${company.categoryHints.join(" / ") || "N/A"}`);
    lines.push("- peers:");
    for (const peer of company.peers) lines.push(`  - ${peer.code} ${peer.name}: ${peer.relation}`);
    if (company.peers.length === 0) lines.push("  - N/A");
    lines.push("- demand drivers:");
    for (const item of company.customerOrDemandDrivers) lines.push(`  - ${item}`);
    if (company.customerOrDemandDrivers.length === 0) lines.push("  - N/A");
    lines.push("- better peer risk:");
    for (const item of company.betterPeerRisk) lines.push(`  - ${item}`);
    if (company.betterPeerRisk.length === 0) lines.push("  - N/A");
    lines.push("- evidence checks:");
    for (const item of company.evidenceChecks) lines.push(`  - ${item}`);
    if (company.evidenceChecks.length === 0) lines.push("  - N/A");
    lines.push("");
  }

  lines.push("## rule");
  lines.push("- テーマは正しいが銘柄が違う可能性を必ず見る");
  lines.push("- 関連会社の方が本命なら company-hypotheses.yml を更新する");
  lines.push("- betterPeerRisk が強い銘柄は単独で調査候補にしない");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "company_network_latest.md"), lines.join("\n"), "utf-8");
  console.log(`company network report: ${Object.keys(companies).length}`);
}

main();
