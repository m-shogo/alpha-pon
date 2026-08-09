import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectSanrioRealPilotPreflight,
  renderSanrioRealPilotPreflight,
} from "../src/research/edinet-sanrio-real-pilot-preflight.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function sandbox(): { root: string; acquisition: string; configuredAcquisition: string } {
  const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-preflight-"));
  const root = join(base, "data", "edinet");
  const acquisition = join(root, "sanrio-acquisition.20260806T064708Z");
  const configuredAcquisition = join(root, "sanrio-acquisition.20260807T080000Z");
  mkdirSync(acquisition, { recursive: true });
  mkdirSync(configuredAcquisition, { recursive: true });
  return { root, acquisition, configuredAcquisition };
}

function addFidelity(acquisition: string): string {
  const name = "revision-source-fidelity-v1.20260806T090000Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    source: "edinet",
    reviewStatus: "pending_human_review",
    appendAuthorized: false,
  });
  return name;
}

function addInspection(acquisition: string): string {
  const name = "revision-unmatched-anchor-inspection-v1.20260806T092942Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    reviewStatus: "pending_human_review",
    appendAuthorized: false,
  });
  return name;
}

function addHumanInput(acquisition: string, inspection: string): string {
  const name = "revision-human-review-input-v1.20260807T070000Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    sourceInspectionFile: inspection,
    reviewStatus: "draft_human_input",
    appendAuthorized: false,
  });
  return name;
}

function addHumanDecision(acquisition: string, inspection: string): string {
  const name = "revision-human-review-decision-v1.20260807T071000Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    sourceInspectionFile: inspection,
    reviewStatus: "complete_human_review",
    appendAuthorized: false,
  });
  return name;
}

function addInventory(root: string): string {
  const name = "sanrio-edinet-inventory-compatibility-v1.20260807T072000Z.json";
  writeJson(join(root, name), {
    schemaVersion: 1,
    source: "edinet",
    migrationReadyForHumanReview: true,
    replacementAuthorized: false,
    appendAuthorized: false,
  });
  return name;
}

function addConfiguredReview(configuredAcquisition: string): string {
  const name = "configured-human-comparison-record-v1.20260807T073000Z.json";
  writeJson(join(configuredAcquisition, name), {
    schemaVersion: 1,
    source: "edinet",
    reviewStatus: "complete_human_comparison_review",
    appendAuthorized: false,
  });
  return name;
}

function addWorkspace(input: {
  root: string;
  configuredAcquisition: string;
  inventory: string;
  legacyRelative: string;
  configuredRelative: string;
}): string {
  const name = "legacy-configured-parity-workspace-v1.20260807T074000Z.json";
  writeJson(join(input.configuredAcquisition, name), {
    schemaVersion: 1,
    sourceInventoryAuditFile: input.inventory,
    sourceLegacyReviewPath: input.legacyRelative,
    sourceConfiguredReviewPath: input.configuredRelative,
    machineStatus: "parity_workspace_ready_for_human_mapping",
    replacementAuthorized: false,
    appendAuthorized: false,
  });
  return name;
}

function addParityInput(configuredAcquisition: string, workspace: string): string {
  const name = "legacy-configured-parity-review-input-v1.20260807T075000Z.json";
  writeJson(join(configuredAcquisition, name), {
    schemaVersion: 1,
    sourceWorkspaceFile: workspace,
    reviewStatus: "draft_human_input",
    appendAuthorized: false,
  });
  return name;
}

function addParityRecord(configuredAcquisition: string, workspace: string): string {
  const name = "legacy-configured-parity-review-record-v1.20260807T080000Z.json";
  writeJson(join(configuredAcquisition, name), {
    schemaVersion: 1,
    sourceWorkspaceFile: workspace,
    reviewStatus: "complete_human_parity_review",
    replacementAuthorized: false,
    appendAuthorized: false,
  });
  return name;
}

{
  const { root } = sandbox();
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "inspection_required");
  assert.equal(result.nextCommand, null);
  assert.deepEqual(result.missingInputs, ["revision-source-fidelity-v1.*.json"]);
  console.log("edinet-sanrio-real-pilot-preflight: missing fidelity remains explicit upstream gate OK");
}

{
  const { root, acquisition } = sandbox();
  writeJson(join(acquisition, "revision-source-fidelity-v1.invalid.json"), {
    schemaVersion: 1,
    source: "other",
    reviewStatus: "pending_human_review",
    appendAuthorized: false,
  });
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "inspection_required");
  assert.equal(result.nextCommand, null);
  assert.equal(result.selectedFiles.fidelity, undefined);
  assert.deepEqual(result.missingInputs, ["revision-source-fidelity-v1.*.json"]);
  console.log("edinet-sanrio-real-pilot-preflight: unusable fidelity cannot authorize inspection command OK");
}

{
  const { root, acquisition } = sandbox();
  const fidelity = addFidelity(acquisition);
  writeJson(join(acquisition, "revision-source-fidelity-v1.newer-invalid.json"), {
    schemaVersion: 1,
    source: "other",
    reviewStatus: "pending_human_review",
    appendAuthorized: false,
  });
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "inspection_required");
  assert.equal(result.requiresHumanAction, false);
  assert.equal(result.selectedFiles.fidelity, `sanrio-acquisition.20260806T064708Z/${fidelity}`);
  assert.match(result.nextCommand ?? "", /run-sanrio-edinet-unmatched-anchor-inspection-local\.sh/);
  assert.match(result.nextCommand ?? "", /--fidelity/);
  assert.match(result.nextCommand ?? "", new RegExp(fidelity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(result.nextCommand ?? "", /newer-invalid/);
  assert.deepEqual(result.missingInputs, ["revision-unmatched-anchor-inspection-v1.*.json"]);
  console.log("edinet-sanrio-real-pilot-preflight: newest unusable fidelity is ignored in favor of usable provenance OK");
}

{
  const { root, acquisition } = sandbox();
  const inspection = addInspection(acquisition);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "human_review_template_required");
  assert.equal(result.requiresHumanAction, true);
  assert.match(result.nextCommand ?? "", /run-sanrio-edinet-human-review-decision-local\.sh/);
  assert.match(result.nextCommand ?? "", new RegExp(inspection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.log("edinet-sanrio-real-pilot-preflight: inspection selects human review template command OK");
}

{
  const { root, acquisition } = sandbox();
  const inspection = addInspection(acquisition);
  const input = addHumanInput(acquisition, inspection);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "human_review_finalize_required");
  assert.match(result.nextCommand ?? "", new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.log("edinet-sanrio-real-pilot-preflight: edited human input selects finalize command OK");
}

{
  const { root, acquisition } = sandbox();
  const inspection = addInspection(acquisition);
  addHumanDecision(acquisition, inspection);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_inputs_required");
  assert.deepEqual(result.missingInputs.sort(), [
    "complete configured-human-comparison-record-v1.*.json",
    "green sanrio-edinet-inventory-compatibility-v1.*.json",
  ].sort());
  console.log("edinet-sanrio-real-pilot-preflight: completed legacy review surfaces missing parity inputs OK");
}

{
  const { root, acquisition, configuredAcquisition } = sandbox();
  const inspection = addInspection(acquisition);
  const decision = addHumanDecision(acquisition, inspection);
  const inventory = addInventory(root);
  const configured = addConfiguredReview(configuredAcquisition);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_workspace_required");
  assert.match(result.nextCommand ?? "", /run-sanrio-configured-parity-workspace-local\.sh/);
  assert.match(result.nextCommand ?? "", new RegExp(decision.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.nextCommand ?? "", new RegExp(inventory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.nextCommand ?? "", new RegExp(configured.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.log("edinet-sanrio-real-pilot-preflight: complete parity inputs produce exact workspace command OK");
}

{
  const { root, acquisition, configuredAcquisition } = sandbox();
  const inspection = addInspection(acquisition);
  const decision = addHumanDecision(acquisition, inspection);
  const inventory = addInventory(root);
  const configured = addConfiguredReview(configuredAcquisition);
  const legacyRelative = `sanrio-acquisition.20260806T064708Z/${decision}`;
  const configuredRelative = `sanrio-acquisition.20260807T080000Z/${configured}`;

  writeJson(join(configuredAcquisition, "legacy-configured-parity-workspace-v1.wrong.json"), {
    schemaVersion: 1,
    sourceInventoryAuditFile: inventory,
    sourceLegacyReviewPath: "sanrio-acquisition.other/revision-human-review-decision-v1.other.json",
    sourceConfiguredReviewPath: configuredRelative,
    machineStatus: "parity_workspace_ready_for_human_mapping",
    replacementAuthorized: false,
    appendAuthorized: false,
  });

  const workspace = addWorkspace({ root, configuredAcquisition, inventory, legacyRelative, configuredRelative });
  let result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_human_template_required");
  assert.equal(result.selectedFiles.parityWorkspace, `sanrio-acquisition.20260807T080000Z/${workspace}`);
  assert.match(result.nextCommand ?? "", /run-sanrio-configured-parity-human-review-local\.sh/);
  console.log("edinet-sanrio-real-pilot-preflight: mismatched workspace lineage is ignored OK");

  const parityInput = addParityInput(configuredAcquisition, workspace);
  result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_human_finalize_required");
  assert.match(result.nextCommand ?? "", new RegExp(parityInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.log("edinet-sanrio-real-pilot-preflight: parity input selects human finalize command OK");

  const parityRecord = addParityRecord(configuredAcquisition, workspace);
  result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_complete_foundation_gate_pending");
  assert.equal(result.nextCommand, null);
  assert.equal(result.selectedFiles.parityReviewRecord, `sanrio-acquisition.20260807T080000Z/${parityRecord}`);
  const rendered = renderSanrioRealPilotPreflight(result);
  assert.match(rendered, /rawContentPrinted: false/);
  assert.doesNotMatch(rendered, /confirmedFacts|sourceText|exactAmounts/);
  console.log("edinet-sanrio-real-pilot-preflight: completed parity stops at real Foundation gate without raw-content output OK");
}

console.log("edinet-sanrio-real-pilot-preflight.test.ts passed");
