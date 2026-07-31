import assert from "node:assert/strict";
import { loadHistoricalShockCaseContext, resolveHistoricalThresholdCalibrationEligibilityDetailed } from "../src/idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";
import {
  loadThresholdCandidateBacklog,
  rankThresholdCandidateBacklog,
  summarizeThresholdCandidateBacklogStatus,
  validateThresholdCandidateBacklogPayload,
  type ThresholdCandidateBacklogRow,
} from "../src/idiosyncratic-shock-threshold-candidate-backlog.js";
import { buildThresholdDiversityRows, type ThresholdDiversityRow } from "../src/idiosyncratic-shock-threshold-diversity-audit.js";

const backlog = loadThresholdCandidateBacklog();
assert.equal(backlog.version, 1);
assert.equal(backlog.selectionPolicy.basis, "structural_coverage_only");
assert.equal(backlog.selectionPolicy.knownHistoricalOutcomeMayExist, true);
assert.equal(backlog.candidates.length, 11, "two frozen backlog batches should contain 11 candidates");
assert.equal(new Set(backlog.candidates.map(row => row.id)).size, backlog.candidates.length, "candidate ids must be unique");

for (const row of backlog.candidates) {
  assert(["company", "regulator", "exchange"].includes(row.primarySource.sourceType), `${row.id}: primary source required`);
  const serialized = JSON.stringify(row);
  for (const forbidden of ["scoreVector", "priceState", "futureReturn", "return3m", "recoveryPattern", "outcomePattern", "realizedOutcome"]) {
    assert(!serialized.includes(`\"${forbidden}\"`), `${row.id}: backlog leaked forbidden field ${forbidden}`);
  }
}

const firstBatchScores = new Map<string, number>([
  ["benesse-2014-data-leak", 9],
  ["dentsu-2016-labor-violation", 8],
  ["chipotle-2015-ecoli", 7],
  ["guess-2018-marciano", 12],
  ["starbucks-2018-philadelphia", 11],
]);
const secondBatchIds = [
  "recruit-2019-rikunabi-dmp",
  "jal-2018-alcohol-compliance",
  "kobe-steel-2017-quality-falsification",
  "tesla-2018-musk-sec",
  "equifax-2017-cybersecurity-breach",
  "wells-fargo-2016-unauthorized-accounts",
] as const;

const historical = new Map(loadHistoricalShockCases().map(row => [row.id, row]));
const contexts = loadHistoricalShockCaseContext();
for (const [id, expectedScore] of firstBatchScores) {
  const backlogRow = backlog.candidates.find(row => row.id === id);
  assert(backlogRow);
  assert.equal(backlogRow.researchState, "promoted", `${id}: first batch must stay promoted`);
  const item = historical.get(id);
  assert(item, `${id}: promoted candidate must exist in historical DB`);
  assert.equal(item.score, expectedScore, `${id}: PIT score must not be fit to threshold`);
  assert.equal(item.priceStateAtCheckpoint, "unknown", `${id}: later price path must not enter checkpoint score`);
  assert.equal(item.outcome?.recoveryPattern, "unknown", `${id}: realized recovery must remain outside intake`);
}
assert.equal(historical.get("chipotle-2015-ecoli")?.score, 7, "backlog must accept a candidate outside the 8-11 research band");
assert.equal(historical.get("guess-2018-marciano")?.score, 12, "backlog must accept a candidate at production threshold");

for (const id of secondBatchIds) {
  const row = backlog.candidates.find(candidate => candidate.id === id);
  assert(row, `${id}: second outcome-blind batch must stay frozen in backlog`);
  assert.equal(row.researchState, "unscored", `${id}: second batch must remain unscored before PIT research`);
  assert.equal(historical.has(id), false, `${id}: unscored candidate must not silently appear in scored historical DB`);
}
assert.equal(secondBatchIds.filter(id => backlog.candidates.find(row => row.id === id)?.market === "JP").length, 3);
assert.equal(secondBatchIds.filter(id => backlog.candidates.find(row => row.id === id)?.market === "US").length, 3);

for (const [id, blocker] of [
  ["chipotle-2015-ecoli", "incidentClusterStatus=cascade"],
  ["starbucks-2018-philadelphia", "investigationStatus=open"],
] as const) {
  const item = historical.get(id);
  assert(item);
  const shadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(item, contexts.get(id));
  assert.equal(shadow.status, "confirmed_block", `${id}: non-score hard blocker must survive threshold shadow`);
  assert(shadow.blockers.includes(blocker), `${id}: expected blocker ${blocker}`);
}

const diversityRows = buildThresholdDiversityRows();
const liveStatus = summarizeThresholdCandidateBacklogStatus(backlog.candidates, diversityRows);
assert.equal(liveStatus.activeCandidateCount, 6, "second batch replenishes active research queue");
assert.equal(liveStatus.promotedCount, 5);
assert.equal(liveStatus.thresholdChangeReady, false, "threshold=12 research gate must still be unmet");
assert.equal(liveStatus.replenishmentRequired, false, "active outcome-blind candidates satisfy the replenishment requirement");

const exhaustedFixture = backlog.candidates.map(row => row.researchState === "unscored"
  ? { ...row, researchState: "promoted" as const }
  : row);
const exhaustedStatus = summarizeThresholdCandidateBacklogStatus(exhaustedFixture, diversityRows);
assert.equal(exhaustedStatus.activeCandidateCount, 0);
assert.equal(exhaustedStatus.thresholdChangeReady, false);
assert.equal(exhaustedStatus.replenishmentRequired, true, "queue exhaustion must trigger replenishment while threshold gate is unmet");
assert(exhaustedStatus.blockers.includes("active threshold candidate backlog exhausted while threshold diversity is not ready"));

const baseCandidate: ThresholdCandidateBacklogRow = {
  id: "fixture-us",
  company: "Fixture US",
  ticker: "FIX",
  market: "US",
  eventDate: "2020-01-01",
  category: "new_category_us",
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
const jpFixture: ThresholdCandidateBacklogRow = {
  ...baseCandidate,
  id: "fixture-jp",
  company: "Fixture JP",
  ticker: "9999",
  market: "JP",
  category: "new_category_jp",
};
const synthetic = [jpFixture, baseCandidate];
const ranked = rankThresholdCandidateBacklog(synthetic, diversityFixture);
assert.equal(ranked[0]?.market, "US", "larger US deficit should outrank smaller JP deficit");
assert(ranked[0]?.gapReasons.some(reason => reason.includes("US control deficit 2")));
const syntheticStatus = summarizeThresholdCandidateBacklogStatus(synthetic, diversityFixture);
assert.equal(syntheticStatus.replenishmentRequired, false, "active structural candidates suppress replenishment warning");
assert.equal(syntheticStatus.activeCandidateCount, 2);
const rankingWithoutOutcomes = ranked.map(row => row.id);
const rankingWithOnlyUsableFlagChanged = rankThresholdCandidateBacklog(synthetic, diversityFixture.map(row => ({ ...row, usable3m: true }))).map(row => row.id);
assert.deepEqual(rankingWithOnlyUsableFlagChanged, rankingWithoutOutcomes, "candidate priority must not change when realized 3m usability changes");

console.log("idiosyncratic-shock threshold candidate backlog tests: batch1=5 promoted, batch2=6 frozen unscored, outcome-blind queue replenished");
