import { existsSync, readFileSync, writeFileSync } from "fs";
import { normalizeReadOnlyJsonObjectArrayField } from "./read-only-json.js";

const UI_DATA_PATH = "apps/web/public/generated/alpha-pon-data.json";

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function main() {
  const data = readJson<Record<string, unknown>>(UI_DATA_PATH, {});
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
    stockProCommitteeLoad.invalidRoot ? "reports/stock_pro_committee_latest.json: invalid_root (expected object)" : null,
    stockProCommitteeLoad.invalidField ? "reports/stock_pro_committee_latest.json.decisions: invalid_field (expected array)" : null,
  ].filter((value): value is string => Boolean(value));

  const merged = {
    ...data,
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
  console.log("merged stock pro data into apps/web/public/generated/alpha-pon-data.json");
}

main();