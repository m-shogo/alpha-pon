// Historical PASSがlegacy undated sourceへ依存していないかを監査する。
// 後方互換のためcase本体のundated sourceは現状許可するが、PIT品質負債として可視化し段階的にdated sourceへ置換する。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import type { HistoricalShockCase, ShockSource } from "./idiosyncratic-shock.js";
import {
  isHistoricalEligibilityEvidenceAvailableAtCheckpoint,
  isTrustedHistoricalPrimarySource,
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
  resolveHistoricalThresholdCalibrationEligibility,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";

function publishedDate(source: ShockSource): string | null {
  const value = source.publishedAt?.slice(0, 10) ?? null;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sourceSummary(item: HistoricalShockCase, added: ShockSource[]) {
  const checkpoint = item.decisionCheckpoint;
  const originalDatedSafe = item.sources.filter(source => {
    const date = publishedDate(source);
    return date != null && date <= checkpoint;
  });
  const originalUndated = item.sources.filter(source => publishedDate(source) == null);
  const originalFuture = item.sources.filter(source => {
    const date = publishedDate(source);
    return date != null && date > checkpoint;
  });
  const addedDatedSafe = added.filter(source => isHistoricalEligibilityEvidenceAvailableAtCheckpoint(source, checkpoint));
  const addedFutureOrUndated = added.filter(source => !isHistoricalEligibilityEvidenceAvailableAtCheckpoint(source, checkpoint));
  const datedSafe = [...originalDatedSafe, ...addedDatedSafe];
  const datedPrimary = datedSafe.filter(isTrustedHistoricalPrimarySource);
  const datedMajor = datedSafe.filter(source => source.sourceType === "major_media");
  const datedGateSatisfied = datedPrimary.length > 0 || datedMajor.length >= 2;
  return {
    originalDatedSafe,
    originalUndated,
    originalFuture,
    addedDatedSafe,
    addedFutureOrUndated,
    datedGateSatisfied,
  };
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const rows = cases.map(item => {
    const context = contexts.get(item.id);
    const production = resolveHistoricalStrategyEligibility(item, context);
    const calibration = resolveHistoricalThresholdCalibrationEligibility(item, context);
    const sources = sourceSummary(item, context?.strategyEligibilityEvidenceSources ?? []);
    const passRelevant = production === "confirmed_pass" || calibration === "confirmed_pass";
    const legacyUndatedDebt = passRelevant && !sources.datedGateSatisfied && sources.originalUndated.length > 0;
    const futureSourceDebt = (sources.originalFuture.length + sources.addedFutureOrUndated.length) > 0;
    return {
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      production,
      calibration,
      datedGateSatisfied: sources.datedGateSatisfied,
      originalDatedSafe: sources.originalDatedSafe.length,
      originalUndated: sources.originalUndated.length,
      originalFuture: sources.originalFuture.length,
      addedDatedSafe: sources.addedDatedSafe.length,
      addedFutureOrUndated: sources.addedFutureOrUndated.length,
      legacyUndatedDebt,
      futureSourceDebt,
    };
  });

  const passRows = rows.filter(row => row.production === "confirmed_pass" || row.calibration === "confirmed_pass");
  const legacyDebt = passRows.filter(row => row.legacyUndatedDebt).sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const futureDebt = rows.filter(row => row.futureSourceDebt).sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const fullyDated = passRows.filter(row => row.datedGateSatisfied);

  const payload = {
    generatedAt: date,
    passRelevantCases: passRows.length,
    fullyDatedCheckpointSourceGate: fullyDated.length,
    legacyUndatedSourceDebt: legacyDebt.length,
    futureOrUndatedAddedEvidenceDebt: futureDebt.length,
    legacyDebt,
    futureDebt,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_pit_source_audit_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  const lines = [
    "# 企業固有ショック PIT Source Audit",
    "",
    `生成日: ${date}`,
    "",
    `- production/shadow PASS relevant cases: ${passRows.length}`,
    `- dated checkpoint-safe source gate satisfied: ${fullyDated.length}`,
    `- legacy undated source debt: ${legacyDebt.length}`,
    `- future/undated added evidence debt: ${futureDebt.length}`,
    "",
    "> legacy case本体のundated sourceは後方互換で暫定許可するが、PIT品質負債としてdated checkpoint-safe sourceへ置換する。",
    "> sidecarへ後から追加したeligibility evidenceはpublishedAt必須で、checkpoint後/undatedならPASS gateに使わない。",
    "",
    "## Legacy undated PASS debt",
    "",
    ...(legacyDebt.length
      ? legacyDebt.map(row => `- ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20, checkpoint ${row.checkpoint}): originalUndated=${row.originalUndated}`)
      : ["- none"]),
    "",
    "## Future / undated added evidence debt",
    "",
    ...(futureDebt.length
      ? futureDebt.map(row => `- ${row.country} ${row.ticker ?? "-"} ${row.company}: originalFuture=${row.originalFuture}, addedFutureOrUndated=${row.addedFutureOrUndated}`)
      : ["- none"]),
  ];
  writeFileSync("reports/idiosyncratic_shock_pit_source_audit_latest.md", lines.join("\n"), "utf-8");

  console.log(`shock PIT source audit: passRelevant=${passRows.length} fullyDated=${fullyDated.length} legacyUndatedDebt=${legacyDebt.length} futureDebt=${futureDebt.length}`);
}

main();
