import assert from "node:assert/strict";
import {
  loadThresholdCandidateBacklog,
  loadThresholdCandidateResearchState,
  validateThresholdCandidateResearchStatePayload,
} from "../src/idiosyncratic-shock-threshold-candidate-backlog.js";

const basePath = "data/idiosyncratic_shock_threshold_candidate_backlog.yml";
const expansionPath = "data/idiosyncratic_shock_threshold_candidate_backlog_expansion_01.yml";

const base = loadThresholdCandidateBacklog(basePath);
const expansion = loadThresholdCandidateBacklog(expansionPath);
const merged = loadThresholdCandidateBacklog();
const states = loadThresholdCandidateResearchState();

assert.equal(base.candidates.length, 11, "base backlog keeps batch1+2 intake provenance");
assert.equal(expansion.candidates.length, 4, "batch3 expansion must contain four frozen candidates");
assert.equal(merged.candidates.length, 15, "default loader must merge base + expansion batches");
assert.equal(states.size, 15, "every frozen candidate requires an explicit separate research-state record");
assert.equal(new Set(merged.candidates.map(row => row.id)).size, merged.candidates.length, "merged backlog IDs must remain unique");

for (const row of expansion.candidates) {
  assert.equal(row.researchState, "unscored", `${row.id}: immutable expansion intake must stay unscored forever`);
  const mergedRow = merged.candidates.find(candidate => candidate.id === row.id);
  assert(mergedRow, `${row.id}: expansion candidate missing from merged loader`);
  assert.equal(mergedRow.researchState, "promoted", `${row.id}: research progress must come from separate state registry`);
  assert.equal(states.get(row.id)?.researchState, "promoted", `${row.id}: promoted state registry entry required`);
}

assert.throws(
  () => validateThresholdCandidateResearchStatePayload({
    version: 1,
    generatedAt: "2026-07-31",
    description: "fixture state registry rejects outcome and score leakage fields",
    states: {
      "fixture-case": { researchState: "promoted", decidedAt: "2026-07-31", score: 11 },
    },
  }),
  /unsupported state field score/,
  "state registry stores lifecycle only, never score/outcome facts",
);

assert.throws(
  () => loadThresholdCandidateBacklog("data/idiosyncratic_shock_case_selection.yml"),
  /selectionPolicy/,
  "wrong envelope must fail rather than silently loading as backlog",
);

console.log(`idiosyncratic-shock threshold backlog expansions: rawExpansion=${expansion.candidates.length} merged=${merged.candidates.length} states=${states.size}`);
