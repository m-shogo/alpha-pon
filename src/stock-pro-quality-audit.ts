import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type Company = {
  code: string;
  name: string;
  evidenceToCheck?: string[];
  nonMoveReasonCandidates?: string[];
  downsideHypothesis?: string;
  noMoveHypothesis?: string;
  relatedCompanies?: string[];
};
type Hypotheses = { categories?: Record<string, { label: string; companies?: Company[] }> };
type Network = { companies?: Record<string, { betterPeerRisk?: string[]; peers?: unknown[] }> };
type IrEventEntry = { type: string; date?: string | null; sourceUrl?: string | null; sourceStatus?: string };
type IrEvents = { companies?: Record<string, { events?: IrEventEntry[] }> };
type Gate = { id: string; label: string; severity: "critical" | "high" | "medium"; failAction: string; proQuestion: string };
type GateConfig = { qualityGates?: Gate[] };

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function hasConfirmedIr(events: IrEventEntry[] = []): boolean {
  return events.some(event => event.date && event.sourceUrl && event.sourceStatus !== "official_check_required");
}

function gatePass(gateId: string, company: Company, network: Network, irEvents: IrEvents): boolean {
  const events = irEvents.companies?.[company.code]?.events ?? [];
  const net = network.companies?.[company.code];
  switch (gateId) {
    case "official_ir_events":
      return events.length > 0 && hasConfirmedIr(events);
    case "primary_source":
      return (company.evidenceToCheck ?? []).some(item => item.includes("決算") || item.includes("IR") || item.includes("招集") || item.includes("説明資料"));
    case "financial_quality":
      return (company.evidenceToCheck ?? []).some(item => item.includes("利益") || item.includes("ROIC") || item.includes("FCF") || item.includes("営業利益率"));
    case "valuation_context":
      return (company.evidenceToCheck ?? []).some(item => item.includes("PER") || item.includes("PBR") || item.includes("バリュエーション"));
    case "company_network":
      return Boolean(net) && ((net?.peers ?? []).length > 0 || (company.relatedCompanies ?? []).length > 0);
    case "regime_alignment":
      return true;
    case "non_move_reason":
      return Boolean(company.noMoveHypothesis) && (company.nonMoveReasonCandidates ?? []).length > 0;
    case "downside_case":
      return Boolean(company.downsideHypothesis);
    default:
      return false;
  }
}

function main() {
  const date = todayJst();
  const hypotheses = readYaml<Hypotheses>("config/company-hypotheses.yml", {});
  const network = readYaml<Network>("config/company-network.yml", {});
  const irEvents = readYaml<IrEvents>("config/company-ir-events.yml", {});
  const gateConfig = readYaml<GateConfig>("config/stock-pro-quality-gate.yml", {});
  const gates = gateConfig.qualityGates ?? [];

  const lines: string[] = [];
  lines.push("# alpha-pon stock pro quality audit");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("株Proに見せても恥ずかしくない最低限の確認ができているかを監査します。買い推奨ではありません。");
  lines.push("");
  lines.push("| label | code | name | category | failedCritical | failedHigh | failedMedium | finalQuality |");
  lines.push("|---|---|---|---|---:|---:|---:|---|");

  const details: string[] = [];
  for (const [categoryId, category] of Object.entries(hypotheses.categories ?? {})) {
    for (const company of category.companies ?? []) {
      const failed = gates.filter(gate => !gatePass(gate.id, company, network, irEvents));
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
