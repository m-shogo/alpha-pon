import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { enrichShockCalibrationObservations } from "./idiosyncratic-shock-calibration.js";
import { loadShockCalibrationConfig } from "./idiosyncratic-shock-calibration-config.js";
import { auditValidatedLocalThresholdEvidence } from "./idiosyncratic-shock-calibration-registry-evidence.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";

type OutcomePayload = { records?: ShockHistoricalOutcomeRecord[] };

function main(): void {
  const generatedAt = todayJst();
  const config = loadShockCalibrationConfig();

  if (config.validatedLocalThresholds.length === 0) {
    const payload = {
      generatedAt,
      registryEntries: 0,
      outcomeDatasetPresent: existsSync(OUTCOME_PATH),
      result: "not_applicable",
      audits: [],
    };
    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/idiosyncratic_shock_calibration_registry_evidence_audit_latest.json", JSON.stringify(payload, null, 2), "utf-8");
    console.log("shock calibration registry evidence audit: registry empty, no local threshold can activate");
    return;
  }

  if (!existsSync(OUTCOME_PATH)) {
    throw new Error("validated local threshold registry is non-empty but quantitative outcome dataset is missing");
  }

  const raw = JSON.parse(readFileSync(OUTCOME_PATH, "utf-8")) as OutcomePayload;
  const records = Array.isArray(raw.records) ? raw.records : [];
  if (records.length === 0) throw new Error("validated local threshold registry is non-empty but outcome records are empty");

  const observations = enrichShockCalibrationObservations(records, loadHistoricalShockCases());
  const audits = config.validatedLocalThresholds.map(entry => auditValidatedLocalThresholdEvidence(entry, observations));
  const failures = audits.filter(row => row.issues.length > 0);

  const payload = {
    generatedAt,
    registryEntries: config.validatedLocalThresholds.length,
    outcomeDatasetPresent: true,
    result: failures.length === 0 ? "pass" : "fail",
    audits,
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_calibration_registry_evidence_audit_latest.json", JSON.stringify(payload, null, 2), "utf-8");

  if (failures.length > 0) {
    throw new Error(`shock calibration registry evidence mismatch: ${failures.map(row => `${row.id}: ${row.issues.join(" / ")}`).join("; ")}`);
  }
  console.log(`shock calibration registry evidence audit: pass entries=${audits.length}`);
}

main();
