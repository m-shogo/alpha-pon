import assert from "node:assert/strict";
import {
  addSanrioFoundationReadinessAdvisory,
  renderSanrioRealPilotPreflightWithReadinessAdvisory,
} from "../src/research/edinet-sanrio-real-pilot-readiness-advisory.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

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

console.log("edinet-sanrio-real-pilot-readiness-advisory.test.ts passed");
