import assert from "node:assert/strict";
import { loadHistoricalShockCaseContext, resolveHistoricalThresholdCalibrationEligibilityDetailed } from "../src/idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";
import {
  loadThresholdCandidateBacklog,
  rankThresholdCandidateBacklog,
  validateThresholdCandidateBacklogPayload,
  type ThresholdCandidateBacklogRow,
} from "../src/idiosyncratic-shock-threshold-candidate-backlog.js";
import type { ThresholdDiversityRow } from "../src/idiosyncratic-shock-threshold-diversity-audit.js";

const backlog = loadThresholdCandidateBacklog();
assert.equal(backlog.version, 1);
assert.equal(backlog.selectionPolicy.basis, "structural_coverage_only");
assert.equal(backlog.selectionPolicy.knownHistoricalOutcomeMayExist, true);
assert(backlog.candidates.length >= 5, `structural backlog should retain >=5 frozen candidates: ${backlog.candidates.length}`);
assert.equal(new Set(backlog.candidates.map(row => row.id)).size, backlog.candidates.length, "candidate ids must be unique");

for (const row of backlog.candidates) {
  assert(["company", "regulator", "exchange"].includes(row.primarySource.sourceType), `${row.id}: primary source required`);
  const serialized = JSON.stringify(row);
  for (const forbidden of ["scoreVector", "priceState", "futureReturn", "return3m", "recoveryPattern", "outcomePattern", "realizedOutcome"]) {
    assert(!serialized.includes(`\"${forbidden}\"`), `${row.id}: backlog leaked forbidden field ${forbidden}`);
  }
}

const promoted = [
  ["benesse-2014-data-leak", 9],
  ["dentsu-2016-labor-violation", 8],
  ["chipotle-2015-ecoli", 7],
] as const;
const historical = new Map(loadHistoricalShockCases().map(row => [row.id, row]));
const contexts = loadHistoricalShockCaseContext();
for (const [id, score] of promoted) {
  assert.equal(backlog.candidates.find(row => row.id === id)?.researchState, "promoted", `${id}: completed research must remain as promoted provenance`);
  const item = historical.get(id);
  assert(item, `${id}: promoted candidate must exist in historical DB`);
  assert.equal(item.score, score, `${id}: PIT score must not be fit to threshold`);
  assert.equal(item.priceStateAtCheckpoint, "unknown", `${id}: later price path must not enter checkpoint score`);
  assert.equal(item.outcome?.recoveryPattern, "unknown", `${id}: realized recovery must remain outside intake`);
}
assert.equal(historical.get("chipotle-2015-ecoli")?.score, 7, "backlog must accept a candidate landing outside the 8-11 research band");
const chipotle = historical.get("chipotle-2015-ecoli");
assert(chipotle);
const chipotleShadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(chipotle, contexts.get(chipotle.id));
assert.equal(chipotleShadow.status, "confirmed_block");
assert(chipotleShadow.blockers.includes("incidentClusterStatus=cascade"));

for (const id of ["starbucks-2018-philadelphia", "guess-2018-marciano"]) {
  assert.equal(backlog.candidates.find(row => row.id === id)?.researchState, "unscored", `${id}: next backlog case must remain unscored`);
}

const baseCandidate: ThresholdCandidateBacklogRow = {
  id: "fixture-case",
  company: "Fixture Corp",
  ticker: "FIX",
  market: "US",
  eventDate: "2020-01-01",
  category: "new_category",
  researchState: "unscored",
  discoveryReason: "structural candidate selected to test outcome-blind validation and ranking behavior",
  primarySource: { title: "Fixture primary disclosure", url: "https://example.com/fixture", sourceType: "company", publishedAt: "2020-01-01" },
};
function payload(candidate: Record<string, unknown>) {
  return {
    version: 1,
    generatedAt: "2026-07-31",
    description: "fixture backlog with structural-only selection and no realized market outcome inputs",
    selectionPolicy: {
      basis: "structural_coverage_only",
      knownHistoricalOutcomeMayExist: true,
      forbiddenInputs: ["future_return", "recovery_pattern", "realized_outcome", "post_event_price_path"],
    },
    candidates: [candidate],
  };
}
assert.throws(() => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, score: 10 })), /forbidden pre-score\/pre-outcome field score/);
assert.throws(() => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, futureReturn3m: 12.3 })), /forbidden pre-score\/pre-outcome field futureReturn3m/);
assert.throws(() => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, outcomePattern: "fast" })), /forbidden pre-score\/pre-outcome field outcomePattern/);

const diversityFixture: ThresholdDiversityRow[] = [{
  id: "existing-jp-control", company: "JP Existing", ticker: "0000", country: "JP", market: "JP", score: 11,
  category: "existing_category", actorType: "employee", calibrationEligibility: "confirmed_pass", replayReady: true,
  supportedMarket: true, usable3m: false,
}];
const ranked = rankThresholdCandidateBacklog(backlog.candidates, diversityFixture);
assert.equal(ranked.length, 2, "only the two unscored US candidates should remain active");
assert(ranked.every(row => row.market === "US"));
assert(ranked.every(row => row.gapReasons.includes("score band intentionally unknown until PIT-safe scoring")));
const rankingWithoutOutcomes = ranked.map(row => row.id);
const rankingWithOnlyUsableFlagChanged = rankThresholdCandidateBacklog(backlog.candidates, diversityFixture.map(row => ({ ...row, usable3m: true }))).map(row => row.id);
assert.deepEqual(rankingWithOnlyUsableFlagChanged, rankingWithoutOutcomes, "candidate priority must not change when realized 3m usability changes");

console.log(`idiosyncratic-shock threshold candidate backlog tests: frozen=${backlog.candidates.length} active=${ranked.length}, promoted scores=9/8/7`);
