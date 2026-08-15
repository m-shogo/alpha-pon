import { existsSync, readFileSync, writeFileSync } from "fs";
import { normalizeReadOnlyJsonObjectArrayField } from "./read-only-json.js";

const UI_DATA_PATH = "apps/web/public/generated/alpha-pon-data.json";
const STOCK_CANDIDATES_PATH = "apps/web/public/generated/stock-candidates.json";

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function main() {
  const dataRaw = readJson<unknown>(UI_DATA_PATH, null);
  const universeCandidatesLoad = normalizeReadOnlyJsonObjectArrayField<Record<string, unknown>>(
    dataRaw,
    "universeCandidates",
  );
  const data = universeCandidatesLoad.object ?? {};
  const universeScan = isRecord(data.universeScan)
    ? { ...data.universeScan, count: universeCandidatesLoad.rows.length }
    : data.universeScan ?? null;

  const stockCandidatesRaw = readJson<unknown>(STOCK_CANDIDATES_PATH, null);
  const stockCandidatesLoad = normalizeReadOnlyJsonObjectArrayField<Record<string, unknown>>(
    stockCandidatesRaw,
    "candidates",
  );
  const sanitizedStockCandidates = {
    ...(stockCandidatesLoad.object ?? {}),
    candidates: stockCandidatesLoad.rows,
    count: stockCandidatesLoad.rows.length,
  };

  const buffettQuality = readJson("data/buffett_quality_latest.json", { generatedAt: null, snapshots: [] });
  const valuationSnapshots = readJson("data/valuation_snapshot_latest.json", { generatedAt: null, snapshots: [] });
  const irEventEvidence = readJson("data/ir_event_evidence_latest.json", { generatedAt: null, events: [] });
  const ipoThemeWatch = readJson("reports/ipo_theme_watch_latest.json", { generatedAt: null, rules: [], phases: [], neverTreatAs: [], outcomeStats: [] });
  const specialSituationWatch = readJson("reports/special_situation_watch_latest.json", {
    generatedAt: null, patterns: [], candidates: [], topChanceList: [], referenceEvents: []
  });
  const specialSituationOps = readJson("reports/special_situation_ops_summary_latest.json", null);
  const hypothesisOutcomeIntegrity = readJson("reports/hypothesis_outcome_integrity_latest.json", null);
  const stockProCommitteeRaw = readJson<unknown>("reports/stock_pro_committee_latest.json", null);
  const stockProCommitteeLoad = normalizeReadOnlyJsonObjectArrayField<Record<string, unknown>>(
    stockProCommitteeRaw,
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
    universeCandidatesLoad.invalidRoot ? `${UI_DATA_PATH}: invalid_root (expected object)` : null,
    universeCandidatesLoad.invalidField ? `${UI_DATA_PATH}.universeCandidates: invalid_field (expected array)` : null,
    stockCandidatesLoad.invalidRoot ? `${STOCK_CANDIDATES_PATH}: invalid_root (expected object)` : null,
    stockCandidatesLoad.invalidField ? `${STOCK_CANDIDATES_PATH}.candidates: invalid_field (expected array)` : null,
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
        existsSync("data/buffett_quality_latest.json") ? null : "data/buffett_quality_latest.json",
        existsSync("data/valuation_snapshot_latest.json") ? null : "data/valuation_snapshot_latest.json",
        existsSync("data/ir_event_evidence_latest.json") ? null : "data/ir_event_evidence_latest.json",
        existsSync("reports/ipo_theme_watch_latest.json") ? null : "reports/ipo_theme_watch_latest.json",
        existsSync("reports/special_situation_watch_latest.json") ? null : "reports/special_situation_watch_latest.json",
        existsSync("reports/special_situation_ops_summary_latest.json") ? null : "reports/special_situation_ops_summary_latest.json",
        existsSync("reports/hypothesis_outcome_integrity_latest.json") ? null : "reports/hypothesis_outcome_integrity_latest.json",
        existsSync("reports/stock_pro_committee_latest.json") ? null : "reports/stock_pro_committee_latest.json",
      ].filter(Boolean),
      warnings: invalidProInputs,
    },
  };

  writeFileSync(UI_DATA_PATH, JSON.stringify(merged, null, 2), "utf-8");
  if (existsSync(STOCK_CANDIDATES_PATH)) {
    writeFileSync(STOCK_CANDIDATES_PATH, JSON.stringify(sanitizedStockCandidates, null, 2), "utf-8");
  }
  console.log("merged stock pro data into apps/web/public/generated/alpha-pon-data.json");
}

main();