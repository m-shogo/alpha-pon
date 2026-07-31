import assert from "node:assert/strict";
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
assert(backlog.candidates.filter(row => row.market === "JP").length >= 2, "backlog needs JP structural candidates");
assert(backlog.candidates.filter(row => row.market === "US").length >= 2, "backlog needs US structural candidates");

const allowedStates = new Set(["unscored", "researching", "promoted", "rejected"]);
for (const row of backlog.candidates) {
  assert(allowedStates.has(row.researchState), `${row.id}: invalid research state`);
  assert(["company", "regulator", "exchange"].includes(row.primarySource.sourceType), `${row.id}: primary source required`);
  const serialized = JSON.stringify(row);
  for (const forbidden of ["scoreVector", "priceState", "futureReturn", "return3m", "recoveryPattern", "outcomePattern", "realizedOutcome"]) {
    assert(!serialized.includes(`\"${forbidden}\"`), `${row.id}: backlog leaked forbidden field ${forbidden}`);
  }
}

const promotedIds = ["benesse-2014-data-leak", "dentsu-2016-labor-violation"];
for (const id of promotedIds) {
  assert.equal(backlog.candidates.find(row => row.id === id)?.researchState, "promoted", `${id}: completed research must remain as promoted provenance`);
}
for (const id of ["starbucks-2018-philadelphia", "guess-2018-marciano", "chipotle-2015-ecoli"]) {
  assert.equal(backlog.candidates.find(row => row.id === id)?.researchState, "unscored", `${id}: next backlog case must remain unscored`);
}

const historical = new Map(loadHistoricalShockCases().map(row => [row.id, row]));
for (const [id, score] of [["benesse-2014-data-leak", 9], ["dentsu-2016-labor-violation", 8]] as const) {
  const item = historical.get(id);
  assert(item, `${id}: promoted candidate must exist in historical case DB`);
  assert.equal(item.score, score, `${id}: promotion must accept PIT score rather than fitting threshold`);
  assert.equal(item.priceStateAtCheckpoint, "unknown", `${id}: later price knowledge must not enter checkpoint score`);
  assert.equal(item.outcome?.recoveryPattern, "unknown", `${id}: realized recovery must not enter candidate selection`);
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
  primarySource: {
    title: "Fixture primary disclosure",
    url: "https://example.com/fixture",
    sourceType: "company",
    publishedAt: "2020-01-01",
  },
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
assert.throws(
  () => validateThresholdCandidateBacklogPayload({
    ...payload(baseCandidate),
    selectionPolicy: {
      basis: "structural_coverage_only",
      knownHistoricalOutcomeMayExist: true,
      forbiddenInputs: ["future_return", "recovery_pattern"],
    },
  }),
  /missing realized_outcome/,
);

const diversityFixture: ThresholdDiversityRow[] = [{
  id: "existing-jp-control",
  company: "JP Existing",
  ticker: "0000",
  country: "JP",
  market: "JP",
  score: 11,
  category: "existing_category",
  actorType: "employee",
  calibrationEligibility: "confirmed_pass",
  replayReady: true,
  supportedMarket: true,
  usable3m: false,
}];

const ranked = rankThresholdCandidateBacklog(backlog.candidates, diversityFixture);
assert(ranked.length >= 3, `promoted backlog cases must leave active research candidates: ${ranked.length}`);
assert(promotedIds.every(id => !ranked.some(row => row.id === id)), "promoted candidates must leave active queue");
assert.equal(ranked[0]?.market, "US", "larger US deficit should outrank smaller JP deficit");
assert(ranked[0]?.gapReasons.some(reason => reason.includes("US control deficit 2")));
assert(ranked.every(row => row.gapReasons.includes("score band intentionally unknown until PIT-safe scoring")));

const rankingWithoutOutcomes = ranked.map(row => row.id);
const rankingWithOnlyUsableFlagChanged = rankThresholdCandidateBacklog(
  backlog.candidates,
  diversityFixture.map(row => ({ ...row, usable3m: true })),
).map(row => row.id);
assert.deepEqual(rankingWithOnlyUsableFlagChanged, rankingWithoutOutcomes, "candidate priority must not change when realized 3m usability changes");

console.log(`idiosyncratic-shock threshold candidate backlog tests: frozen=${backlog.candidates.length} active=${ranked.length}, outcome-blind ranking locked`);
