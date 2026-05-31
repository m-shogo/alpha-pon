import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type Company = { code: string; name: string; status?: string; evidenceToCheck?: string[]; relatedCompanies?: string[] };
type Hypotheses = { categories?: Record<string, { label: string; companies?: Company[] }> };
type Network = { companies?: Record<string, unknown> };
type IrEvents = { companies?: Record<string, { events?: Array<{ type: string; date?: string | null; sourceUrl?: string | null; sourceStatus?: string }> }> };
type Policy = { mandatoryChecks?: Array<{ id: string; label: string; why: string }> };

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function main() {
  const date = todayJst();
  const hypotheses = readYaml<Hypotheses>("config/company-hypotheses.yml", {});
  const network = readYaml<Network>("config/company-network.yml", {});
  const irEvents = readYaml<IrEvents>("config/company-ir-events.yml", {});
  const policy = readYaml<Policy>("config/company-onboarding-policy.yml", {});

  const rows: Array<{ code: string; name: string; category: string; coverage: string; missing: string[]; advice: string }> = [];

  for (const [categoryId, category] of Object.entries(hypotheses.categories ?? {})) {
    for (const company of category.companies ?? []) {
      const missing: string[] = [];
      const hasNetwork = Boolean(network.companies?.[company.code]);
      const events = irEvents.companies?.[company.code]?.events ?? [];
      const hasIr = events.length > 0;
      const hasConfirmedIr = events.some(event => event.date && event.sourceUrl && event.sourceStatus !== "official_check_required");
      const hasEvidence = (company.evidenceToCheck ?? []).length >= 3;
      const hasPeers = hasNetwork || (company.relatedCompanies ?? []).length >= 2;

      if (!hasIr) missing.push("shareholder_meeting_or_ir_event");
      if (hasIr && !hasConfirmedIr) missing.push("official_ir_event_detail");
      if (!hasNetwork) missing.push("company_network");
      if (!hasEvidence) missing.push("evidence_to_check");
      if (!hasPeers) missing.push("peer_candidates");
      missing.push("valuation_range_check");
      missing.push("latest_earnings_calendar_check");
      missing.push("financial_quality_check");

      let coverage = "covered";
      if (missing.includes("shareholder_meeting_or_ir_event") || missing.includes("company_network")) coverage = "unknown_or_thin";
      else if (missing.length >= 3) coverage = "provisional";

      const advice = coverage === "covered"
        ? "考察可能。ただし決算/総会/外れ理由は継続更新する"
        : "ラベルを上げず、IRイベント・決算・競合・バリュエーションを先に補完する";

      rows.push({ code: company.code, name: company.name, category: categoryId, coverage, missing, advice });
    }
  }

  const lines: string[] = [];
  lines.push("# alpha-pon company onboarding audit");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("知らない銘柄・薄い銘柄を、賢そうに断言しないための不足監査です。買い推奨ではありません。");
  lines.push("");
  lines.push("## mandatory thinking checks");
  lines.push("");
  for (const check of policy.mandatoryChecks ?? []) lines.push(`- ${check.id}: ${check.label} / ${check.why}`);
  lines.push("");
  lines.push("## company coverage");
  lines.push("");
  lines.push("| coverage | code | name | category | missing | advice |");
  lines.push("|---|---|---|---|---|---|");
  for (const row of rows) {
    lines.push(`| ${row.coverage} | ${row.code} | ${row.name} | ${row.category} | ${row.missing.join(", ")} | ${row.advice} |`);
  }
  lines.push("");
  lines.push("## rule");
  lines.push("- unknown_or_thin は、具体的な上昇/下落判断をしない");
  lines.push("- provisional は、上がらない理由・下がる理由・確認証拠だけ出す");
  lines.push("- covered でも、IRイベントが近い場合は総会/決算/配当を最優先する");
  lines.push("- 知らない銘柄を聞かれたら、まずこのチェックリストに沿って不足を出す");

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "company_onboarding_audit_latest.md"), lines.join("\n"), "utf-8");
  console.log(`company onboarding audit: ${rows.length}`);
}

main();
