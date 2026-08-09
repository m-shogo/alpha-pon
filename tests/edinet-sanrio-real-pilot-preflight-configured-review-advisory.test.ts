import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectSanrioRealPilotPreflight } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function sandbox(): { root: string; acquisition: string } {
  const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-configured-advisory-"));
  const root = join(base, "data", "edinet");
  const acquisition = join(root, "sanrio-acquisition.20260809T150000Z");
  mkdirSync(acquisition, { recursive: true });
  return { root, acquisition };
}

function addLegacyReview(acquisition: string): void {
  const inspection = "revision-unmatched-anchor-inspection-v1.20260809T150100Z.json";
  writeJson(join(acquisition, inspection), {
    schemaVersion: 1,
    reviewStatus: "pending_human_review",
    appendAuthorized: false,
  });
  writeJson(join(acquisition, "revision-human-review-decision-v1.20260809T150200Z.json"), {
    schemaVersion: 1,
    sourceInspectionFile: inspection,
    reviewStatus: "complete_human_review",
    appendAuthorized: false,
  });
}

function addComparison(acquisition: string): string {
  const name = "configured-fidelity-exact-comparison-v1.20260809T150300Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    comparisonStatus: "complete_exact_normalized_comparison",
    reviewStatus: "pending_human_comparison_review",
    fuzzyMatchingUsed: false,
    semanticEquivalenceInferred: false,
    officialPdfVisualReviewComplete: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  });
  return name;
}

function addConfiguredInput(acquisition: string, comparison: string): string {
  const name = "configured-human-comparison-input-v1.20260809T150400Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    sourceComparisonFile: comparison,
    reviewStatus: "draft_human_input",
    foundationPreviewEligible: false,
    appendAuthorized: false,
  });
  return name;
}

function addConfiguredReview(acquisition: string): string {
  const name = "configured-human-comparison-record-v1.20260809T150500Z.json";
  writeJson(join(acquisition, name), {
    schemaVersion: 1,
    source: "edinet",
    reviewStatus: "complete_human_comparison_review",
    foundationPreviewEligible: false,
    appendAuthorized: false,
  });
  return name;
}

{
  const { root, acquisition } = sandbox();
  addLegacyReview(acquisition);
  const comparison = addComparison(acquisition);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_inputs_required");
  assert.equal(result.requiresHumanAction, true);
  assert.equal(
    result.selectedFiles.configuredComparison,
    `sanrio-acquisition.20260809T150000Z/${comparison}`,
  );
  assert.match(result.nextCommand ?? "", /run-configured-edinet-human-comparison-review-local\.sh/);
  assert.match(result.nextCommand ?? "", /--comparison/);
  assert.match(result.nextCommand ?? "", new RegExp(comparison.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(result.missingInputs.includes("green sanrio-edinet-inventory-compatibility-v1.*.json"));
  assert.ok(result.missingInputs.includes("complete configured-human-comparison-record-v1.*.json"));
  console.log("edinet-sanrio-preflight-configured-review: exact comparison produces template command OK");
}

{
  const { root, acquisition } = sandbox();
  addLegacyReview(acquisition);
  const comparison = addComparison(acquisition);
  const input = addConfiguredInput(acquisition, comparison);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_inputs_required");
  assert.equal(result.requiresHumanAction, true);
  assert.equal(
    result.selectedFiles.configuredHumanReviewInput,
    `sanrio-acquisition.20260809T150000Z/${input}`,
  );
  assert.match(result.nextCommand ?? "", /--finalize/);
  assert.match(result.nextCommand ?? "", new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.log("edinet-sanrio-preflight-configured-review: matching draft input produces finalize command OK");
}

{
  const { root, acquisition } = sandbox();
  addLegacyReview(acquisition);
  addComparison(acquisition);
  addConfiguredReview(acquisition);
  const result = inspectSanrioRealPilotPreflight(root);
  assert.equal(result.stage, "parity_inputs_required");
  assert.equal(result.requiresHumanAction, false);
  assert.equal(result.nextCommand, null);
  assert.deepEqual(result.missingInputs, ["green sanrio-edinet-inventory-compatibility-v1.*.json"]);
  console.log("edinet-sanrio-preflight-configured-review: completed configured review does not loop advisory OK");
}

console.log("edinet-sanrio-real-pilot-preflight-configured-review-advisory.test.ts passed");
