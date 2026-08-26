import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import type { CompanyHypothesisReportCompany } from "./company-hypothesis-report-input.js";
import type { CompanyNetworkReportCompany } from "./company-coverage-input.js";
import { hasConfirmedProIrSource } from "./pro-ir-event-input.js";
import type { NormalizedProIrCompany } from "./pro-ir-event-input.js";
import { normalizeStockProQualityInputs } from "./stock-pro-quality-input.js";

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function gatePass(
  gateId: string,
  company: CompanyHypothesisReportCompany,
  networkCompanies: Record<string, CompanyNetworkReportCompany>,
  irCompanies: Record<string, NormalizedProIrCompany>,
): boolean {
  const events = irCompanies[company.code]?.events ?? [];
  const net = networkCompanies[company.code];
  switch (gateId) {
    case "official_ir_events":
      return events.length > 0 && events.some(event => hasConfirmedProIrSource(event));
    case "primary_source":
      return company.evidenceToCheck.some(item => item.includes("決算") || item.includes("IR") || item.includes("招集") || item.includes("説明資料"));
    case "financial_quality":
      return company.evidenceToCheck.some(item => item.includes("利益") || item.includes("ROIC") || item.includes("FCF") || item.includes("営業利益率"));
    case "valuation_context":
      return company.evidenceToCheck.some(item => item.includes("PER") || item.includes("PBR") || item.includes("バリュエーション"));
    case "company_network":
      return Boolean(net) && (net.peers.length > 0 || company.relatedCompanies.length > 0);
    case "regime_alignment":
      return true;
    case "non_move_reason":
      return Boolean(company.noMoveHypothesis) && company.nonMoveReasonCandidates.length > 0;
    case "downside_case":
      return Boolean(company.downsideHypothesis);
    default:
      return false;
  }
}

function main() {
  const date = todayJst();
  const input = normalizeStockProQualityInputs(
    readYaml<unknown>("config/company-hypotheses.yml", {}),
    readYaml<unknown>("config/company-network.yml", {}),
    readYaml<unknown>("config/company-ir-events.yml", {}),
    readYaml<unknown>("config/stock-pro-quality-gate.yml", {}),
    date,
  );

  const lines: string[] = [];
  lines.push("# alpha-pon stock pro quality audit");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("株Proに見せても恥ずかしくない最低限の確認ができているかを監査します。買い推奨ではありません。");
  lines.push("");
  lines.push("## input health");
  lines.push("");
  lines.push(`- health status: ${input.warnings.length > 0 ? "action_required" : "ok"}`);
  lines.push(`- input warnings: ${input.warnings.length}`);
  if (input.warnings.length === 0) lines.push("- warning: none");
  for (const warning of input.warnings) lines.push(`- warning: ${warning}`);
  lines.push("");
  lines.push("| label | code | name | category | failedCritical | failedHigh | failedMedium | finalQuality |");
  lines.push("|---|---|---|---|---:|---:|---:|---|");

  const details: string[] = [];
  for (const [categoryId, category] of Object.entries(input.categories)) {
    for (const company of category.companies) {
      const failed = input.gates.filter(gate => !gatePass(gate.id, company, input.networkCompanies, input.irCompanies));
      const failedCritical = failed.filter(gate => gate.severity === "critical");
      const failedHigh = failed.filter(gate => gate.severity === "high");
      const failedMedium = failed.filter(gate => gate.severity === "medium");
      const finalQuality = failedCritical.length > 0 ? "blocked" : failedHigh.length > 0 ? "provisional" : "covered";
      lines.push(`| ${finalQuality} | ${company.code} | ${company.name} | ${categoryId} | ${failedCritical.length} | ${failedHigh.length} | ${failedMedium.length} | ${finalQuality} |`);

      if (failed.length > 0) {
        details.push(`## ${company.code} ${company.name}`);
        details.push("");
        details.push(`- category: ${categoryId}`);
        details.push(`- finalQuality: ${finalQuality}`);
        details.push("- failed gates:");
        for (const gate of failed) {
          details.push(`  - ${gate.severity}: ${gate.id} / ${gate.label}`);
          details.push(`    - pro question: ${gate.proQuestion}`);
          details.push(`    - fail action: ${gate.failAction}`);
        }
        details.push("");
      }
    }
  }

  lines.push("");
  lines.push("## detail");
  lines.push("");
  lines.push(...details);
  lines.push("## rule");
  lines.push("- blocked は、Pro品質として結論を急がない");
  lines.push("- provisional は、仮説と不足項目だけ出す");
  lines.push("- covered でも、決算/総会/配当/資本政策のイベントが近い時は再確認する");
  lines.push("- 良い会社・良い株価・良いタイミングを混同しない");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "stock_pro_quality_audit_latest.md"), lines.join("\n"), "utf-8");
  console.log("stock pro quality audit generated");
}

main();