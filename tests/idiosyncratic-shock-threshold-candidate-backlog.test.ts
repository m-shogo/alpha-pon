import assert from "node:assert/strict";
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
assert(backlog.candidates.length >= 5, `unscored structural backlog should contain >=5 cases: ${backlog.candidates.length}`);
assert(new Set(backlog.candidates.map(row => row.id)).size === backlog.candidates.length, "candidate ids must be unique");
assert(backlog.candidates.filter(row => row.market === "JP").length >= 2, "backlog needs JP structural candidates");
assert(backlog.candidates.filter(row => row.market === "US").length >= 2, "backlog needs US structural candidates");

for (const row of backlog.candidates) {
  assert.equal(row.researchState, "unscored", `${row.id}: initial backlog must remain unscored until PIT research starts`);
  assert(["company", "regulator", "exchange"].includes(row.primarySource.sourceType), `${row.id}: primary source required`);
  const serialized = JSON.stringify(row);
  for (const forbidden of ["scoreVector", "priceState", "futureReturn", "return3m", "recoveryPattern", "outcomePattern", "realizedOutcome"]) {
    assert(!serialized.includes(`\"${forbidden}\"`), `${row.id}: backlog leaked forbidden field ${forbidden}`);
  }
}

for (const id of [
  "benesse-2014-data-leak",
  "dentsu-2016-labor-violation",
  "starbucks-2018-philadelphia",
  "guess-2018-marciano",
  "chipotle-2015-ecoli",
]) {
  assert(backlog.candidates.some(row => row.id === id), `missing frozen structural candidate: ${id}`);
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

assert.throws(
  () => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, score: 10 })),
  /forbidden pre-score\/pre-outcome field score/,
  "candidate backlog must not pre-fit score",
);
assert.throws(
  () => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, futureReturn3m: 12.3 })),
  /forbidden pre-score\/pre-outcome field futureReturn3m/,
  "future return must never influence candidate intake",
);
assert.throws(
  () => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, outcomePattern: "fast" })),
  /forbidden pre-score\/pre-outcome field outcomePattern/,
  "known recovery outcome must stay outside candidate intake",
);
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
  "selection policy must keep all anti-leak forbidden inputs explicit",
);

const diversityFixture: ThresholdDiversityRow[] = [
  {
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
  },
];

const ranked = rankThresholdCandidateBacklog(backlog.candidates, diversityFixture);
assert(ranked.length >= 5);
assert.equal(ranked[0]?.market, "US", "US deficit should prioritize US structural candidates before extra JP cases");
assert(ranked[0]?.gapReasons.some(reason => reason.includes("US control deficit")));
assert(ranked.every(row => row.gapReasons.includes("score band intentionally unknown until PIT-safe scoring")));

const rankingWithoutOutcomes = ranked.map(row => row.id);
const rankingWithOnlyUsableFlagChanged = rankThresholdCandidateBacklog(
  backlog.candidates,
  diversityFixture.map(row => ({ ...row, usable3m: true })),
).map(row => row.id);
assert.deepEqual(
  rankingWithOnlyUsableFlagChanged,
  rankingWithoutOutcomes,
  "candidate priority must not change when realized 3m usability changes",
);

console.log(`idiosyncratic-shock threshold candidate backlog tests: ${backlog.candidates.length} unscored candidates, outcome-blind ranking locked`);
