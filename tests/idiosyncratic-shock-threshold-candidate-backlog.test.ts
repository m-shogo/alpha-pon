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
assert.equal(backlog.candidates.length, 19, "four frozen outcome-blind batches should contain 19 candidates");
assert.equal(new Set(backlog.candidates.map(row => row.id)).size, backlog.candidates.length);
assert(backlog.candidates.every(row => row.researchState === "promoted"), "separate research-state registry must close batch1-4 without mutating expansion freeze files");

for (const row of backlog.candidates) {
  const serialized = JSON.stringify(row);
  for (const forbidden of ["scoreVector", "priceState", "futureReturn", "return3m", "recoveryPattern", "outcomePattern", "realizedOutcome"]) {
    assert(!serialized.includes(`\"${forbidden}\"`), `${row.id}: backlog leaked ${forbidden}`);
  }
}

const expectedScores = new Map<string, number>([
  ["benesse-2014-data-leak", 9],
  ["dentsu-2016-labor-violation", 8],
  ["chipotle-2015-ecoli", 7],
  ["guess-2018-marciano", 12],
  ["starbucks-2018-philadelphia", 11],
  ["recruit-2019-rikunabi-dmp", 11],
  ["jal-2018-alcohol-compliance", 9],
  ["kobe-steel-2017-quality-falsification", 8],
  ["tesla-2018-musk-sec", 9],
  ["equifax-2017-cybersecurity-breach", 5],
  ["wells-fargo-2016-unauthorized-accounts", 5],
  ["snow-peak-2022-yamai", 12],
  ["subaru-2017-final-inspection", 8],
  ["lululemon-2018-potdevin", 14],
  ["barnes-noble-2018-parneros", 13],
  ["eneos-2022-sugimori", 14],
  ["japan-post-insurance-2019-improper-sales", 4],
  ["intel-2018-krzanich", 14],
  ["mcdonalds-2019-easterbrook", 15],
]);

const historical = new Map(loadHistoricalShockCases().map(row => [row.id, row]));
const contexts = loadHistoricalShockCaseContext();
for (const row of backlog.candidates) {
  const item = historical.get(row.id);
  assert(item, `${row.id}: promoted candidate must exist in historical DB`);
  assert.equal(item.score, expectedScores.get(row.id), `${row.id}: PIT score must stay outcome-blind`);
  assert.equal(item.priceStateAtCheckpoint, "unknown", `${row.id}: later price path must not enter checkpoint score`);
  assert.equal(item.outcome?.recoveryPattern, "unknown", `${row.id}: realized recovery must remain outside intake`);
}
assert.equal(historical.get("chipotle-2015-ecoli")?.score, 7, "candidate may land below 8-11 band");
assert.equal(historical.get("japan-post-insurance-2019-improper-sales")?.score, 4, "candidate may land far below research boundary band");
assert.equal(historical.get("guess-2018-marciano")?.score, 12, "candidate may land at production threshold");
assert.equal(historical.get("mcdonalds-2019-easterbrook")?.score, 15, "candidate may land clearly above threshold");

for (const [id, blocker] of [
  ["jal-2018-alcohol-compliance", "investigationStatus=open"],
  ["kobe-steel-2017-quality-falsification", "investigationStatus=open"],
  ["tesla-2018-musk-sec", "investigationStatus=open"],
  ["equifax-2017-cybersecurity-breach", "investigationStatus=open"],
  ["wells-fargo-2016-unauthorized-accounts", "recurrenceStatus=systemic"],
  ["recruit-2019-rikunabi-dmp", "investigationStatus=open"],
  ["subaru-2017-final-inspection", "investigationStatus=open"],
  ["japan-post-insurance-2019-improper-sales", "recurrenceStatus=systemic"],
  ["intel-2018-krzanich", "investigationStatus=open"],
] as const) {
  const item = historical.get(id);
  assert(item);
  const shadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(item, contexts.get(id));
  assert.equal(shadow.status, "confirmed_block", `${id}: hard blocker must survive shadow`);
  assert(shadow.blockers.includes(blocker), `${id}: expected ${blocker}`);
}

const diversityRows = buildThresholdDiversityRows();
const liveStatus = summarizeThresholdCandidateBacklogStatus(backlog.candidates, diversityRows);
assert.equal(liveStatus.activeCandidateCount, 0, "batch1-4 are fully researched");
assert.equal(liveStatus.promotedCount, 19);
assert.equal(liveStatus.thresholdChangeReady, false, "threshold research gate remains unmet");
assert.equal(liveStatus.replenishmentRequired, true, "batch5 must be frozen before further threshold research");

const baseCandidate: ThresholdCandidateBacklogRow = {
  id: "fixture-us", company: "Fixture US", ticker: "FIX", market: "US", eventDate: "2020-01-01",
  category: "new_category_us", researchState: "unscored",
  discoveryReason: "structural candidate selected to test outcome-blind validation and ranking behavior",
  primarySource: { title: "Fixture primary disclosure", url: "https://example.com/fixture", sourceType: "company", publishedAt: "2020-01-01" },
};
function payload(candidate: Record<string, unknown>) {
  return { version: 1, generatedAt: "2026-07-31", description: "fixture structural-only backlog without realized outcomes",
    selectionPolicy: { basis: "structural_coverage_only", knownHistoricalOutcomeMayExist: true,
      forbiddenInputs: ["future_return", "recovery_pattern", "realized_outcome", "post_event_price_path"] }, candidates: [candidate] };
}
assert.throws(() => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, score: 10 })), /forbidden pre-score\/pre-outcome field score/);
assert.throws(() => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, futureReturn3m: 12.3 })), /forbidden pre-score\/pre-outcome field futureReturn3m/);
assert.throws(() => validateThresholdCandidateBacklogPayload(payload({ ...baseCandidate, outcomePattern: "fast" })), /forbidden pre-score\/pre-outcome field outcomePattern/);

const diversityFixture: ThresholdDiversityRow[] = [{ id: "existing-jp-control", company: "JP Existing", ticker: "0000", country: "JP", market: "JP", score: 11,
  category: "existing_category", actorType: "employee", calibrationEligibility: "confirmed_pass", replayReady: true, supportedMarket: true, usable3m: false }];
const jpFixture: ThresholdCandidateBacklogRow = { ...baseCandidate, id: "fixture-jp", company: "Fixture JP", ticker: "9999", market: "JP", category: "new_category_jp" };
const synthetic = [jpFixture, baseCandidate];
const ranked = rankThresholdCandidateBacklog(synthetic, diversityFixture);
assert.equal(ranked[0]?.market, "US", "larger US deficit should outrank smaller JP deficit");
const rankingWithoutOutcomes = ranked.map(row => row.id);
const rankingWithOnlyUsableFlagChanged = rankThresholdCandidateBacklog(synthetic, diversityFixture.map(row => ({ ...row, usable3m: true }))).map(row => row.id);
assert.deepEqual(rankingWithOnlyUsableFlagChanged, rankingWithoutOutcomes, "realized 3m usability must not change candidate priority");

console.log("idiosyncratic-shock threshold candidate backlog tests: 19/19 promoted via separate state registry; batch5 replenishment required");
