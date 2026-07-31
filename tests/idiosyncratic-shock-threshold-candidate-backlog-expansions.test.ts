import assert from "node:assert/strict";
import { loadThresholdCandidateBacklog } from "../src/idiosyncratic-shock-threshold-candidate-backlog.js";

const basePath = "data/idiosyncratic_shock_threshold_candidate_backlog.yml";
const expansionPath = "data/idiosyncratic_shock_threshold_candidate_backlog_expansion_01.yml";

const base = loadThresholdCandidateBacklog(basePath);
const expansion = loadThresholdCandidateBacklog(expansionPath);
const merged = loadThresholdCandidateBacklog();

assert.equal(base.candidates.length, 11, "base backlog keeps completed batch1+2 provenance");
assert.equal(expansion.candidates.length, 4, "batch3 expansion must contain four frozen candidates");
assert.equal(merged.candidates.length, 15, "default loader must merge base + expansion batches");
assert.equal(new Set(merged.candidates.map(row => row.id)).size, merged.candidates.length, "merged backlog IDs must remain unique");

for (const row of expansion.candidates) {
  assert.equal(row.researchState, "unscored", `${row.id}: expansion intake must remain unscored`);
  assert(merged.candidates.some(candidate => candidate.id === row.id), `${row.id}: expansion candidate missing from merged loader`);
}

assert.throws(
  () => loadThresholdCandidateBacklog("data/idiosyncratic_shock_case_selection.yml"),
  /selectionPolicy/,
  "wrong envelope must fail rather than silently loading as backlog",
);

console.log(`idiosyncratic-shock threshold backlog expansions: base=${base.candidates.length} expansion=${expansion.candidates.length} merged=${merged.candidates.length}`);
