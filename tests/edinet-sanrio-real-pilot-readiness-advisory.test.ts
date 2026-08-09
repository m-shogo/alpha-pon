import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addSanrioFoundationReadinessAdvisory,
  addSanrioInventoryCompatibilityAdvisory,
  renderSanrioRealPilotPreflightWithReadinessAdvisory,
} from "../src/research/edinet-sanrio-real-pilot-readiness-advisory.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

const HASH = "a".repeat(64);

function result(
  stage: SanrioRealPilotPreflightResult["stage"],
  parityReviewRecord?: string,
): SanrioRealPilotPreflightResult {
  return {
    schemaVersion: 1,
    root: "/tmp/data/edinet",
    stage,
    nextCommand: null,
    requiresHumanAction: false,
    missingInputs: [],
    selectedFiles: parityReviewRecord ? { parityReviewRecord } : {},
    warnings: [],
    safety: {
      rawContentPrinted: false,
      automaticReplacementAuthorized: false,
      foundationAppendAuthorized: false,
      automaticTradingAuthorized: false,
    },
  };
}

function inventoryRoot(): string {
  const root = join(mkdtempSync(join(tmpdir(), "alpha-pon-inventory-advisory-")), "data", "edinet");
  mkdirSync(root, { recursive: true });
  return root;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function legacyInventory(range = { from: "2026-07-01", to: "2026-07-31" }, scannedBusinessDays = 23) {
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    range,
    generatedAt: "2026-08-09T15:00:00.000Z",
    completeness: "complete",
    scannedBusinessDays,
    failedDates: [],
    candidates: [],
    appendAuthorized: false,
  };
}

function configuredInventory(range = { from: "2026-07-01", to: "2026-07-31" }, scannedBusinessDays = 23) {
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
      boundaryHash: HASH,
    },
    registryHash: HASH,
    range,
    generatedAt: "2026-08-09T15:01:00.000Z",
    completeness: "complete",
    scannedBusinessDays,
    failedDates: [],
    candidates: [],
    factPromotionPolicy: "human_review_required",
    requireOfficialPdfVisualReview: true,
    appendAuthorized: false,
    inventoryHash: HASH,
  };
}

function parityInputsResult(nextCommand = "existing configured-review command"): SanrioRealPilotPreflightResult {
  return {
    ...result("parity_inputs_required"),
    nextCommand,
    requiresHumanAction: true,
    missingInputs: [
      "green sanrio-edinet-inventory-compatibility-v1.*.json",
      "complete configured-human-comparison-record-v1.*.json",
    ],
  };
}

{
  const advised = addSanrioFoundationReadinessAdvisory(result("parity_human_finalize_required"));
  assert.equal(advised.readOnlyFollowUpCommand, null);
  assert.equal(advised.readOnlyFollowUpPurpose, null);
  assert.equal(advised.nextCommand, null);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: no early Foundation advisory OK");
}

{
  const parityPath = "sanrio-acquisition.20260807T080000Z/legacy-configured-parity-review-record-v1.20260807T090000Z.json";
  const advised = addSanrioFoundationReadinessAdvisory(
    result("parity_complete_foundation_gate_pending", parityPath),
  );
  assert.equal(advised.nextCommand, null);
  assert.equal(advised.readOnlyFollowUpPurpose, "foundation_readiness_evidence_gap_audit");
  assert.match(advised.readOnlyFollowUpCommand ?? "", /run-sanrio-configured-foundation-readiness-audit-local\.sh/);
  assert.match(advised.readOnlyFollowUpCommand ?? "", /--execute-readiness-audit/);
  assert.match(advised.readOnlyFollowUpCommand ?? "", /legacy-configured-parity-review-record-v1\.20260807T090000Z\.json/);
  assert.equal(advised.safety.foundationAppendAuthorized, false);
  assert.equal(advised.safety.automaticReplacementAuthorized, false);
  const rendered = renderSanrioRealPilotPreflightWithReadinessAdvisory(advised);
  assert.match(rendered, /readOnlyFollowUpPurpose: foundation_readiness_evidence_gap_audit/);
  assert.match(rendered, /foundationGateStillPending: true/);
  assert.doesNotMatch(rendered, /foundationAppendAuthorized: true|automaticReplacementAuthorized: true/);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: parity-complete stage exposes read-only audit without crossing gate OK");
}

{
  const advised = addSanrioFoundationReadinessAdvisory(
    result("parity_complete_foundation_gate_pending"),
  );
  assert.equal(advised.readOnlyFollowUpCommand, null);
  assert.equal(advised.nextCommand, null);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: missing selected parity record remains fail-closed OK");
}

{
  const root = inventoryRoot();
  writeJson(join(root, "sanrio-edinet-inventory.legacy.2026.json"), legacyInventory());
  writeJson(join(root, "sanrio-edinet-inventory.configured.2026.json"), configuredInventory());
  const advised = addSanrioInventoryCompatibilityAdvisory(parityInputsResult(), root);
  assert.equal(advised.requiresHumanAction, false);
  assert.match(advised.nextCommand ?? "", /audit-edinet-inventory-compatibility-local\.sh/);
  assert.match(advised.nextCommand ?? "", /--legacy 'data\/edinet\/sanrio-edinet-inventory\.legacy\.2026\.json'/);
  assert.match(advised.nextCommand ?? "", /--configured 'data\/edinet\/sanrio-edinet-inventory\.configured\.2026\.json'/);
  assert.doesNotMatch(advised.nextCommand ?? "", /configured-review command/);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: matching local inventories prioritize exact machine audit OK");
}

{
  const root = inventoryRoot();
  writeJson(join(root, "sanrio-edinet-inventory.legacy.2026.json"), legacyInventory());
  writeJson(
    join(root, "sanrio-edinet-inventory.configured.2026.json"),
    configuredInventory({ from: "2026-07-02", to: "2026-07-31" }, 22),
  );
  const original = parityInputsResult();
  const advised = addSanrioInventoryCompatibilityAdvisory(original, root);
  assert.equal(advised.nextCommand, original.nextCommand);
  assert.equal(advised.requiresHumanAction, true);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: mismatched inventory range remains fail-closed to existing advisory OK");
}

{
  const root = inventoryRoot();
  writeJson(join(root, "sanrio-edinet-inventory.legacy.2026.json"), legacyInventory());
  writeJson(join(root, "sanrio-edinet-inventory.configured.2026.json"), {
    ...configuredInventory(),
    inventoryHash: "not-a-hash",
  });
  const original = parityInputsResult();
  const advised = addSanrioInventoryCompatibilityAdvisory(original, root);
  assert.equal(advised.nextCommand, original.nextCommand);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: malformed configured inventory cannot authorize audit advisory OK");
}

{
  const root = inventoryRoot();
  writeJson(join(root, "sanrio-edinet-inventory.legacy.2026.json"), legacyInventory());
  writeJson(join(root, "sanrio-edinet-inventory.configured.2026.json"), configuredInventory());
  const alreadyGreen: SanrioRealPilotPreflightResult = {
    ...parityInputsResult(),
    missingInputs: ["complete configured-human-comparison-record-v1.*.json"],
    selectedFiles: { inventoryAudit: "sanrio-edinet-inventory-compatibility-v1.green.json" },
  };
  const advised = addSanrioInventoryCompatibilityAdvisory(alreadyGreen, root);
  assert.equal(advised.nextCommand, alreadyGreen.nextCommand);
  console.log("edinet-sanrio-real-pilot-readiness-advisory: existing green audit never loops inventory advisory OK");
}

console.log("edinet-sanrio-real-pilot-readiness-advisory.test.ts passed");
