// 過去事例DBの品質監査。ネット不要・決定的に動く。
// pnpm audit:shock-history

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";

const MIN_HISTORICAL_CASES = 59;
const KNOWN_THIRD_PARTY_HOSTS = new Set([
  "minkabu.jp",
  "disclosure.catr.jp",
  "finance.yahoo.co.jp",
  "investing.com",
]);

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "invalid"; }
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const issues: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const categories = new Map<string, number>();
  const confidence = { high: 0, medium: 0, low: 0 };
  const sourceHosts = new Map<string, number>();

  if (cases.length < MIN_HISTORICAL_CASES) {
    issues.push(`historical cases ${cases.length} < minimum ${MIN_HISTORICAL_CASES}`);
  }

  for (const item of cases) {
    if (ids.has(item.id)) issues.push(`duplicate id: ${item.id}`);
    ids.add(item.id);
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
    confidence[item.researchConfidence] += 1;
    for (const source of item.sources) {
      const name = host(source.url);
      sourceHosts.set(name, (sourceHosts.get(name) ?? 0) + 1);
      if (name === "invalid") issues.push(`${item.id}: invalid source URL ${source.url}`);
      if (source.sourceType === "exchange" && KNOWN_THIRD_PARTY_HOSTS.has(name)) {
        warnings.push(`${item.id}: sourceType=exchange but host=${name}; reclassify or replace with official exchange URL`);
      }
    }
    if (item.sources.length === 0) issues.push(`${item.id}: source missing`);
    if (item.researchConfidence === "low" && item.score >= 16) warnings.push(`${item.id}: high score but low research confidence`);
    if (item.category === "accounting_fraud" && item.scores.accountingIntegrity !== 0) {
      issues.push(`${item.id}: accounting_fraud requires accountingIntegrity=0`);
    }
    if (item.category === "accounting_fraud" && item.score >= 12) issues.push(`${item.id}: accounting fraud must not score >=12`);
    if (item.scores.accountingIntegrity === 0 && item.score >= 12) issues.push(`${item.id}: accountingIntegrity=0 must not score >=12`);
    if (item.outcome?.recoveryPattern === "failed" && item.score >= 16) warnings.push(`${item.id}: failed outcome despite historical score ${item.score}; calibration candidate`);
  }

  const requiredCategories = [
    "executive_relationship",
    "personal_behavior",
    "personal_crime",
    "employee_sabotage",
    "customer_sabotage",
    "organizational_governance",
    "systemic_misconduct",
    "accounting_fraud",
    "quality_falsification",
    "product_safety",
    "improper_sales",
  ];
  for (const category of requiredCategories) {
    if (!categories.has(category)) issues.push(`required category missing: ${category}`);
  }

  const summary = {
    generatedAt: date,
    minimumHistoricalCases: MIN_HISTORICAL_CASES,
    totalCases: cases.length,
    scoreBuckets: {
      researchPriority16to20: cases.filter(item => item.score >= 16).length,
      watch12to15: cases.filter(item => item.score >= 12 && item.score < 16).length,
      caution8to11: cases.filter(item => item.score >= 8 && item.score < 12).length,
      avoid0to7: cases.filter(item => item.score < 8).length,
    },
    confidence,
    categories: Object.fromEntries([...categories.entries()].sort((a, b) => b[1] - a[1])),
    sourceHosts: Object.fromEntries([...sourceHosts.entries()].sort((a, b) => b[1] - a[1])),
    issues,
    warnings,
    ok: issues.length === 0,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_history_audit_latest.json", JSON.stringify(summary, null, 2), "utf-8");
  const md = [
    "# 企業固有ショック 過去事例DB監査",
    "",
    `生成日: ${date}`,
    `- total: ${cases.length} / minimum ${MIN_HISTORICAL_CASES}`,
    `- high confidence: ${confidence.high}`,
    `- medium confidence: ${confidence.medium}`,
    `- low confidence: ${confidence.low}`,
    `- RESULT: ${summary.ok ? "OK" : "NG"}`,
    "",
    "## score buckets",
    "",
    `- 16-20: ${summary.scoreBuckets.researchPriority16to20}`,
    `- 12-15: ${summary.scoreBuckets.watch12to15}`,
    `- 8-11: ${summary.scoreBuckets.caution8to11}`,
    `- 0-7: ${summary.scoreBuckets.avoid0to7}`,
    "",
    "## issues",
    "",
    ...(issues.length ? issues.map(value => `- ${value}`) : ["- none"]),
    "",
    "## warnings / calibration candidates",
    "",
    ...(warnings.length ? warnings.map(value => `- ${value}`) : ["- none"]),
  ].join("\n");
  writeFileSync("reports/idiosyncratic_shock_history_audit_latest.md", md, "utf-8");

  console.log(`shock history audit: cases=${cases.length} issues=${issues.length} warnings=${warnings.length}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
