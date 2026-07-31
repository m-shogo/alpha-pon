import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadHistoricalShockCaseContext } from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import {
  assertShockOutcomeDatasetContract,
  type ShockOutcomeDatasetEnvelope,
} from "./idiosyncratic-shock-outcome-contract.js";
import { assertShockOutcomeResearchSnapshotBinding } from "./idiosyncratic-shock-outcome-snapshot-binding.js";
import {
  assertShockResearchSnapshot,
  buildShockResearchSnapshot,
} from "./idiosyncratic-shock-research-snapshot-contract.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";

function main(): void {
  const generatedAt = todayJst();
  mkdirSync("reports", { recursive: true });

  if (!existsSync(OUTCOME_PATH)) {
    const payload = {
      generatedAt,
      outcomeDatasetPresent: false,
      result: "not_applicable",
      reason: "formal outcome dataset has not been generated yet",
    };
    writeFileSync("reports/idiosyncratic_shock_outcome_snapshot_audit_latest.json", JSON.stringify(payload, null, 2), "utf-8");
    console.log("shock outcome snapshot audit: formal outcome dataset absent, not applicable");
    return;
  }

  const payload = JSON.parse(readFileSync(OUTCOME_PATH, "utf-8")) as ShockOutcomeDatasetEnvelope;
  assertShockOutcomeDatasetContract(payload);

  const snapshot = buildShockResearchSnapshot(
    loadHistoricalShockCases(),
    loadHistoricalShockCaseContext(),
    payload.generatedAt,
  );
  assertShockResearchSnapshot(snapshot);
  assertShockOutcomeResearchSnapshotBinding(payload, snapshot);

  const audit = {
    generatedAt,
    outcomeDatasetPresent: true,
    datasetGeneratedAt: payload.generatedAt,
    datasetResearchSnapshotSha256: payload.researchSnapshotSha256,
    currentResearchSnapshotSha256: snapshot.aggregateSha256,
    currentCases: snapshot.cases.length,
    result: "pass",
  };
  writeFileSync("reports/idiosyncratic_shock_outcome_snapshot_audit_latest.json", JSON.stringify(audit, null, 2), "utf-8");
  console.log(`shock outcome snapshot audit: pass cases=${snapshot.cases.length} sha=${snapshot.aggregateSha256}`);
}

main();
