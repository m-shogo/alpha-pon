import { writeFileSync } from "fs";
import { readReadOnlyJsonObjectArrayFile, readReadOnlyJsonObjectFile } from "./read-only-json-file.js";

const UI_DATA_PATH = "apps/web/public/generated/alpha-pon-data.json";
const STOCK_CANDIDATES_PATH = "apps/web/public/generated/stock-candidates.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function main() {
  const universeCandidatesLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(
    UI_DATA_PATH,
    "universeCandidates",
  );
  const data = universeCandidatesLoad.object ?? {};
  const universeScan = isRecord(data.universeScan)
    ? { ...data.universeScan, count: universeCandidatesLoad.rows.length }
    : data.universeScan ?? null;

  const stockCandidatesLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(
    STOCK_CANDIDATES_PATH,
    "candidates",
  );
  const sanitizedStockCandidates = {
    ...(stockCandidatesLoad.object ?? {}),
    candidates: stockCandidatesLoad.rows,
    count: stockCandidatesLoad.rows.length,
  };

  const buffettQualityLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(
    "data/buffett_quality_latest.json",
    "snapshots",
  );
  const buffettQuality = {
    ...(buffettQualityLoad.object ?? {}),
    generatedAt: typeof buffettQualityLoad.object?.generatedAt === "string" ? buffettQualityLoad.object.generatedAt : null,
    snapshots: buffettQualityLoad.rows,
  };
  const valuationSnapshotsLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(
    "data/valuation_snapshot_latest.json",
    "snapshots",
  );
  const valuationSnapshots = {
    ...(valuationSnapshotsLoad.object ?? {}),
    generatedAt: typeof valuationSnapshotsLoad.object?.generatedAt === "string" ? valuationSnapshotsLoad.object.generatedAt : null,
    snapshots: valuationSnapshotsLoad.rows,
  };
  const irEventEvidenceLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(
    "data/ir_event_evidence_latest.json",
    "events",
  );
  const irEventEvidence = {
    ...(irEventEvidenceLoad.object ?? {}),
    generatedAt: typeof irEventEvidenceLoad.object?.generatedAt === "string" ? irEventEvidenceLoad.object.generatedAt : null,
    events: irEventEvidenceLoad.rows,
  };

  const ipoThemeWatchLoad = readReadOnlyJsonObjectFile<Record<string, unknown>>(
    "reports/ipo_theme_watch_latest.json",
  );
  const ipoThemeWatch = ipoThemeWatchLoad.object ?? { generatedAt: null, rules: [], phases: [], neverTreatAs: [], outcomeStats: [] };
  const specialSituationWatchLoad = readReadOnlyJsonObjectFile<Record<string, unknown>>(
    "reports/special_situation_watch_latest.json",
  );
  const specialSituationWatch = specialSituationWatchLoad.object ?? {
    generatedAt: null, patterns: [], candidates: [], topChanceList: [], referenceEvents: []
  };
  const specialSituationOpsLoad = readReadOnlyJsonObjectFile<Record<string, unknown>>(
    "reports/special_situation_ops_summary_latest.json",
  );
  const specialSituationOps = specialSituationOpsLoad.object;
  const hypothesisOutcomeIntegrityLoad = readReadOnlyJsonObjectFile<Record<string, unknown>>(
    "reports/hypothesis_outcome_integrity_latest.json",
  );
  const hypothesisOutcomeIntegrity = hypothesisOutcomeIntegrityLoad.object;

  const stockProCommitteeLoad = readReadOnlyJsonObjectArrayFile<Record<string, unknown>>(
    "reports/stock_pro_committee_latest.json",
    "decisions",
  );
  const stockProCommitteeJson = {
    ...(stockProCommitteeLoad.object ?? {}),
    generatedAt: typeof stockProCommitteeLoad.object?.generatedAt === "string"
      ? stockProCommitteeLoad.object.generatedAt
      : null,
    decisions: stockProCommitteeLoad.rows,
  };
  const legendProCommittee = {
    generatedAt: stockProCommitteeJson.generatedAt,
    decisions: stockProCommitteeJson.decisions.map(decision => ({
      code: decision.code,
      name: decision.name,
      originalFinalLabel: decision.originalFinalLabel ?? null,
      finalLabel: decision.finalLabel,
      finalScore: decision.finalScore,
      consensus: decision.consensus ?? null,
      disagreements: decision.disagreements ?? [],
      nextActions: decision.nextActions ?? [],
      blockers: decision.blockers ?? [],
      missingEvidence: decision.missingEvidence ?? [],
      legendVerdicts: decision.legendVerdicts ?? [],
      legendWarnings: decision.legendWarnings ?? [],
    })),
  };

  const invalidProInputs = [
    universeCandidatesLoad.parseError ? `${UI_DATA_PATH}: parse_error` : null,
    universeCandidatesLoad.invalidRoot ? `${UI_DATA_PATH}: invalid_root (expected object)` : null,
    universeCandidatesLoad.invalidField ? `${UI_DATA_PATH}.universeCandidates: invalid_field (expected array)` : null,
    stockCandidatesLoad.parseError ? `${STOCK_CANDIDATES_PATH}: parse_error` : null,
    stockCandidatesLoad.invalidRoot ? `${STOCK_CANDIDATES_PATH}: invalid_root (expected object)` : null,
    stockCandidatesLoad.invalidField ? `${STOCK_CANDIDATES_PATH}.candidates: invalid_field (expected array)` : null,
    buffettQualityLoad.parseError ? "data/buffett_quality_latest.json: parse_error" : null,
    buffettQualityLoad.invalidRoot ? "data/buffett_quality_latest.json: invalid_root (expected object)" : null,
    buffettQualityLoad.invalidField ? "data/buffett_quality_latest.json.snapshots: invalid_field (expected array)" : null,
    valuationSnapshotsLoad.parseError ? "data/valuation_snapshot_latest.json: parse_error" : null,
    valuationSnapshotsLoad.invalidRoot ? "data/valuation_snapshot_latest.json: invalid_root (expected object)" : null,
    valuationSnapshotsLoad.invalidField ? "data/valuation_snapshot_latest.json.snapshots: invalid_field (expected array)" : null,
    irEventEvidenceLoad.parseError ? "data/ir_event_evidence_latest.json: parse_error" : null,
    irEventEvidenceLoad.invalidRoot ? "data/ir_event_evidence_latest.json: invalid_root (expected object)" : null,
    irEventEvidenceLoad.invalidField ? "data/ir_event_evidence_latest.json.events: invalid_field (expected array)" : null,
    ipoThemeWatchLoad.parseError ? "reports/ipo_theme_watch_latest.json: parse_error" : null,
    ipoThemeWatchLoad.invalidRoot ? "reports/ipo_theme_watch_latest.json: invalid_root (expected object)" : null,
    specialSituationWatchLoad.parseError ? "reports/special_situation_watch_latest.json: parse_error" : null,
    specialSituationWatchLoad.invalidRoot ? "reports/special_situation_watch_latest.json: invalid_root (expected object)" : null,
    specialSituationOpsLoad.parseError ? "reports/special_situation_ops_summary_latest.json: parse_error" : null,
    specialSituationOpsLoad.invalidRoot ? "reports/special_situation_ops_summary_latest.json: invalid_root (expected object)" : null,
    hypothesisOutcomeIntegrityLoad.parseError ? "reports/hypothesis_outcome_integrity_latest.json: parse_error" : null,
    hypothesisOutcomeIntegrityLoad.invalidRoot ? "reports/hypothesis_outcome_integrity_latest.json: invalid_root (expected object)" : null,
    stockProCommitteeLoad.parseError ? "reports/stock_pro_committee_latest.json: parse_error" : null,
    stockProCommitteeLoad.invalidRoot ? "reports/stock_pro_committee_latest.json: invalid_root (expected object)" : null,
    stockProCommitteeLoad.invalidField ? "reports/stock_pro_committee_latest.json.decisions: invalid_field (expected array)" : null,
  ].filter((value): value is string => Boolean(value));

  const merged = {
    ...data,
    universeCandidates: universeCandidatesLoad.rows,
    universeScan,
    buffettQuality,
    valuationSnapshots,
    irEventEvidence,
    ipoThemeWatch,
    specialSituationWatch,
    specialSituationOps,
    hypothesisOutcomeIntegrity,
    stockProCommitteeJson,
    legendProCommittee,
    proDataMeta: {
      source: "pro-ui-data-addon",
      generatedAt: new Date().toISOString(),
      missing: [
        universeCandidatesLoad.missing ? UI_DATA_PATH : null,
        stockCandidatesLoad.missing ? STOCK_CANDIDATES_PATH : null,
        buffettQualityLoad.missing ? "data/buffett_quality_latest.json" : null,
        valuationSnapshotsLoad.missing ? "data/valuation_snapshot_latest.json" : null,
        irEventEvidenceLoad.missing ? "data/ir_event_evidence_latest.json" : null,
        ipoThemeWatchLoad.missing ? "reports/ipo_theme_watch_latest.json" : null,
        specialSituationWatchLoad.missing ? "reports/special_situation_watch_latest.json" : null,
        specialSituationOpsLoad.missing ? "reports/special_situation_ops_summary_latest.json" : null,
        hypothesisOutcomeIntegrityLoad.missing ? "reports/hypothesis_outcome_integrity_latest.json" : null,
        stockProCommitteeLoad.missing ? "reports/stock_pro_committee_latest.json" : null,
      ].filter(Boolean),
      warnings: invalidProInputs,
    },
  };

  writeFileSync(UI_DATA_PATH, JSON.stringify(merged, null, 2), "utf-8");
  if (!stockCandidatesLoad.missing) {
    writeFileSync(STOCK_CANDIDATES_PATH, JSON.stringify(sanitizedStockCandidates, null, 2), "utf-8");
  }
  console.log("merged stock pro data into apps/web/public/generated/alpha-pon-data.json");
}

main();