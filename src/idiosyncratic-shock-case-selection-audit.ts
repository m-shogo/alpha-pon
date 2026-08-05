import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadShockCaseSelection,
  resolveShockCaseSelection,
} from "./idiosyncratic-shock-case-selection.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";

function main(): void {
  const generatedAt = todayJst();
  const cases = loadHistoricalShockCases();
  const registry = loadShockCaseSelection();
  const knownIds = new Set(cases.map(item => item.id));

  const orphanRegistryIds = [...registry.keys()].filter(id => !knownIds.has(id)).sort();
  if (orphanRegistryIds.length > 0) {
    throw new Error(`shock case selection registry has unknown case ids: ${orphanRegistryIds.join(", ")}`);
  }

  const rows = cases.map(item => {
    const selection = registry.get(item.id);
    const resolved = resolveShockCaseSelection(item.id, selection, item.decisionCheckpoint);
    return {
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      checkpoint: item.decisionCheckpoint,
      registeredAt: selection?.registeredAt ?? null,
      frozenCheckpoint: selection?.decisionCheckpointAtRegistration ?? null,
      score: item.score,
      provenance: resolved.provenance,
      selectionMode: resolved.selectionMode,
      outcomeVisibilityAtSelection: resolved.outcomeVisibilityAtSelection,
      registrationTimingVerified: resolved.registrationTimingVerified,
      validationHoldoutEligible: resolved.validationHoldoutEligible,
      resolutionReason: resolved.reason,
    };
  });

  const invalidProspective = rows.filter(row => row.selectionMode === "prospective_pre_outcome" && !row.validationHoldoutEligible);
  if (invalidProspective.length > 0) {
    throw new Error(`invalid prospective case-selection provenance: ${invalidProspective.map(row => `${row.id} (${row.resolutionReason})`).join("; ")}`);
  }

  const explicit = rows.filter(row => row.provenance === "explicit");
  const legacyUntracked = rows.filter(row => row.provenance === "legacy_untracked");
  const validationHoldout = rows.filter(row => row.validationHoldoutEligible);
  const retrospective = rows.filter(row => row.selectionMode === "retrospective_research");
  const matchedControls = rows.filter(row => row.selectionMode === "matched_negative_control");

  const payload = {
    generatedAt,
    totalCases: rows.length,
    explicitSelectionProvenance: explicit.length,
    legacyUntrackedSelection: legacyUntracked.length,
    retrospectiveResearchCases: retrospective.length,
    matchedNegativeControls: matchedControls.length,
    prospectiveValidationHoldoutEligible: validationHoldout.length,
    holdoutReady: validationHoldout.length > 0,
    rows,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_case_selection_audit_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  const lines = [
    "# 企業固有ショック Case Selection Audit",
    "",
    `生成日: ${generatedAt}`,
    "",
    `- historical cases: ${rows.length}`,
    `- explicit selection provenance: ${explicit.length}`,
    `- legacy/untracked: ${legacyUntracked.length}`,
    `- retrospective research: ${retrospective.length}`,
    `- prospective validation holdout eligible: ${validationHoldout.length}`,
    `- holdout ready: ${payload.holdoutReady ? "YES" : "NO"}`,
    "",
    "> retrospective / legacy-untracked cases may support research and calibration, but must never be presented as pristine prospective holdout evidence.",
    "> a future live case becomes holdout-eligible only when it is registered as prospective_pre_outcome, the outcome is still unobserved, registeredAt is no later than the frozen decision checkpoint, and that frozen checkpoint matches the case DB.",
    "",
    "## Explicit provenance",
    "",
    ...(explicit.length
      ? explicit.map(row => `- ${row.id}: ${row.selectionMode}, registered=${row.registeredAt ?? "-"}, frozenCheckpoint=${row.frozenCheckpoint ?? "-"}, caseCheckpoint=${row.checkpoint}, timing=${row.registrationTimingVerified ? "verified" : "n/a"}, outcome=${row.outcomeVisibilityAtSelection}, holdout=${row.validationHoldoutEligible ? "yes" : "no"}`)
      : ["- none"]),
    "",
    "## Legacy / untracked selection debt",
    "",
    ...(legacyUntracked.length
      ? legacyUntracked.map(row => `- ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20, checkpoint ${row.checkpoint})`)
      : ["- none"]),
  ];
  writeFileSync("reports/idiosyncratic_shock_case_selection_audit_latest.md", lines.join("\n"), "utf-8");

  console.log(`shock case selection audit: total=${rows.length} explicit=${explicit.length} legacy=${legacyUntracked.length} retrospective=${retrospective.length} prospectiveHoldout=${validationHoldout.length}`);
}

main();
