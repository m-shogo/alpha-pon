import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { readGeneratedCompanyRules } from "./pro-generated-rules-input.js";
import type { ValuationSnapshot } from "./pro-types.js";

type Company = { code: string; name: string; evidenceToCheck?: string[]; noMoveHypothesis?: string; downsideHypothesis?: string };
type Hypotheses = { categories?: Record<string, { companies?: Company[] }> };
type GeneratedRule = {
  code: string;
  name: string;
  risks?: string[];
  evidenceNeeded?: string[];
  priceSignal?: { relativeTopix20dPct?: number | null; change20dPct?: number | null; volumeSpikeRatio?: number | null };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalFiniteNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

function isGeneratedRule(value: unknown): value is GeneratedRule {
  if (!isRecord(value) || !isCanonicalText(value.code) || !isCanonicalText(value.name)) return false;
  if (value.risks !== undefined && !isStringArray(value.risks)) return false;
  if (value.evidenceNeeded !== undefined && !isStringArray(value.evidenceNeeded)) return false;
  if (value.priceSignal === undefined) return true;
  if (!isRecord(value.priceSignal)) return false;
  return isOptionalFiniteNumber(value.priceSignal.relativeTopix20dPct)
    && isOptionalFiniteNumber(value.priceSignal.change20dPct)
    && isOptionalFiniteNumber(value.priceSignal.volumeSpikeRatio);
}

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function readRules(): Map<string, GeneratedRule> {
  const load = readGeneratedCompanyRules<GeneratedRule>("data/generated_company_rules_latest.json", todayJst(), isGeneratedRule);
  return new Map(load.rows.map(rule => [rule.code, rule]));
}

function buildSnapshot(company: Company, rule?: GeneratedRule): ValuationSnapshot {
  const text = [...(company.evidenceToCheck ?? []), company.noMoveHypothesis, company.downsideHypothesis, ...(rule?.risks ?? []), ...(rule?.evidenceNeeded ?? [])].filter(Boolean).join(" ");
  const valuationRisks: string[] = [];
  const missingData = ["PER", "PBR", "PER/PBR過去レンジ", "同業比較", "EV/EBITDA", "PSR"];

  if (/織り込み済み|期待が高|期待先行|過熱|高値|急騰/.test(text)) valuationRisks.push("期待先行・織り込み済みの可能性");
  if ((rule?.priceSignal?.change20dPct ?? 0) >= 20) valuationRisks.push("20日騰落率が大きく、短期過熱の可能性");
  if ((rule?.priceSignal?.relativeTopix20dPct ?? 0) >= 15) valuationRisks.push("市場比で強く、追いかけ注意");
  if ((rule?.priceSignal?.volumeSpikeRatio ?? 0) >= 2.5) valuationRisks.push("出来高急増後の反動に注意");

  return {
    code: company.code,
    name: company.name,
    asOf: todayJst(),
    per: null,
    pbr: null,
    psr: null,
    evEbitda: null,
    dividendYield: null,
    perPercentile5y: null,
    pbrPercentile5y: null,
    peerPerMedian: null,
    peerPbrMedian: null,
    growthAdjustedValuation: "unknown",
    valuationRisks,
    missingData,
  };
}

function main() {
  const hypotheses = readYaml<Hypotheses>("config/company-hypotheses.yml", {});
  const rules = readRules();
  const companies = Object.values(hypotheses.categories ?? {}).flatMap(category => category.companies ?? []);
  const snapshots = companies.map(company => buildSnapshot(company, rules.get(company.code)));
  mkdirSync("data", { recursive: true });
  writeFileSync("data/valuation_snapshot_latest.json", JSON.stringify({ generatedAt: todayJst(), snapshots }, null, 2), "utf-8");
  console.log(`valuation snapshots generated: ${snapshots.length}`);
}

main();