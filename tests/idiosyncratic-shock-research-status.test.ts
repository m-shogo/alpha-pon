import assert from "node:assert/strict";
import {
  classifyShockResearchReasons,
  summarizeShockResearchReasons,
} from "../src/idiosyncratic-shock-research-status.js";

const reasons = classifyShockResearchReasons({
  blockers: [
    "score=11<12",
    "investigationStatus=open",
    "confounderStatus=major",
    "liquidityStatus=halted",
    "explicit confirmed_block",
  ],
  missingEvidence: [
    "strategyInvestigationStatusAtCheckpoint",
    "trusted primary source or >=2 major media",
    "priceReactionStartDate for announcement timing",
  ],
});

assert.deepEqual(reasons.map(reason => reason.code), [
  "score_below_production_threshold",
  "investigation_open",
  "major_confounder",
  "liquidity_untradeable",
  "explicit_block",
  "investigation_status_unknown",
  "source_gate_missing",
  "reaction_date_missing",
]);
assert(reasons.slice(0, 5).every(reason => reason.kind === "hard_block"));
assert(reasons.slice(5).every(reason => reason.kind === "missing_evidence"));

const unknown = classifyShockResearchReasons({
  blockers: ["future-new-blocker=value"],
  missingEvidence: ["future-new-evidence"],
});
assert.deepEqual(unknown.map(reason => reason.code), ["other", "other"], "unknown resolver wording must remain visible instead of being silently dropped");

assert.deepEqual(summarizeShockResearchReasons([...reasons, ...unknown]), {
  explicit_block: 1,
  investigation_open: 1,
  investigation_status_unknown: 1,
  liquidity_untradeable: 1,
  major_confounder: 1,
  other: 2,
  reaction_date_missing: 1,
  score_below_production_threshold: 1,
  source_gate_missing: 1,
});

console.log("idiosyncratic-shock research status tests: OK");
