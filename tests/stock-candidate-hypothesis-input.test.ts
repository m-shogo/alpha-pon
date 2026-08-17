import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHypothesisOutcomesJsonl, parseHypothesisOutcomeSqlitePayloads } from "../src/hypothesis-outcome-input.js";
import {
  normalizeStockCandidateUniverseRows,
  normalizeStockCandidateWatchlistCodes,
  parseExistingStockCandidateHypothesesJsonl,
} from "../src/stock-candidate-hypothesis-input.js";

const valid = {
  schemaVersion: 1,
  code: "8136",
  name: "サンリオ",
  detectedAt: "2026-08-17",
  reviewDueAt: "2026-09-16",
  reason: "synthetic regression fixture",
  expectedTimeframe: "1m",
  expectedDirection: "unknown",
  confidence: 0.5,
  invalidationSignals: [],
  evidenceNeeded: [],
  relatedWorldEventIds: [],
  relatedDisclosureIds: [],
  status: "open",
  label: "監視候補",
};

const parsed = parseExistingStockCandidateHypothesesJsonl(
  `${JSON.stringify(valid)}\n{ malformed\n\n${JSON.stringify({ ...valid, code: "7974", name: "任天堂" })}\n`,
);

assert.deepEqual(parsed.rows.map(row => row.code), ["8136", "7974"], "malformed rowの前後にある正常仮説を保持する");
assert.equal(parsed.warnings.length, 1, "malformed JSONLをsilent dropしない");
assert.match(parsed.warnings[0], /1 malformed JSONL row\(s\).*line\(s\) 2/, "raw内容ではなく件数と行番号だけを警告する");
assert.ok(!parsed.warnings[0].includes("{ malformed"), "metadata warningへraw row内容を露出しない");

const reviewSource = readFileSync(new URL("../src/review-hypothesis-outcomes.ts", import.meta.url), "utf-8");
assert.match(
  reviewSource,
  /parseExistingStockCandidateHypothesesJsonl\(readFileSync\(HYPOTHESIS_PATH, "utf-8"\), HYPOTHESIS_PATH\)/,
  "review:hypothesesもtested JSONL parserを再利用してmalformed rowを隔離する",
);

const validOutcome = {
  code: "8136",
  hypothesis: { detectedAt: "2026-08-17" },
  reviewHorizon: "1m",
};
const outcomeParsed = parseHypothesisOutcomesJsonl(
  `${JSON.stringify(validOutcome)}\n{}\n{ malformed\n${JSON.stringify({ ...validOutcome, code: "7974" })}\n`,
  "data/hypothesis_outcomes.jsonl",
);
assert.deepEqual(outcomeParsed.rows.map(row => row.code), ["8136", "7974"], "malformed outcome rowを隔離して正常な履歴を保持する");
assert.equal(outcomeParsed.warnings.length, 1, "JSON parse errorとunsafe outcome shapeをmetadata warningへ集約する");
assert.match(outcomeParsed.warnings[0], /2 malformed JSONL row\(s\).*line\(s\) 2, 3/);
assert.ok(!outcomeParsed.warnings[0].includes("{ malformed"), "Outcome warningへraw row内容を露出しない");
assert.match(reviewSource, /readOutcomeJsonl\(OUTCOME_PATH\)/, "review:hypothesesのOutcome migration/readbackもsafe parserを利用する");

const sqliteParsed = parseHypothesisOutcomeSqlitePayloads(
  [JSON.stringify(validOutcome), "{ malformed", JSON.stringify({}), JSON.stringify({ ...validOutcome, code: "7974" })],
  "data/hypothesis_outcomes.db",
);
assert.deepEqual(sqliteParsed.rows.map(row => row.code), ["8136", "7974"], "malformed SQLite payloadをrecord単位で隔離して正常履歴を保持する");
assert.equal(sqliteParsed.warnings.length, 1, "SQLite payload parse/shape errorをmetadata warningへ集約する");
assert.match(sqliteParsed.warnings[0], /2 malformed record\(s\).*record\(s\) 2, 3/);
assert.ok(!sqliteParsed.warnings[0].includes("{ malformed"), "SQLite warningへraw payload内容を露出しない");
assert.match(
  reviewSource,
  /parseHypothesisOutcomeSqlitePayloads\(rows\.map\(row => row\.payload\), OUTCOME_DB_PATH\)/,
  "review:hypothesesのSQLite readbackもrecord単位のsafe parserを利用する",
);

const watchlist = normalizeStockCandidateWatchlistCodes({
  symbols: [
    { code: "8136", name: "サンリオ" },
    null,
    { code: " 7974 ", name: "任天堂" },
    { code: "", name: "missing identity" },
  ],
});
assert.deepEqual([...watchlist.codes], ["8136", "7974"], "malformed rowを隔離しつつ正常custom watchlist identityを保持する");
assert.equal(watchlist.warnings.length, 3, "malformed/canonicalized rowをsilent処理しない");
assert.ok(watchlist.warnings.every(warning => !warning.includes("サンリオ") && !warning.includes("任天堂")), "metadata warningへrow内容を露出しない");

const brokenRoot = normalizeStockCandidateWatchlistCodes(["8136"]);
assert.deepEqual([...brokenRoot.codes], [], "non-object rootを有効watchlistとして扱わない");
assert.match(brokenRoot.warnings[0], /root shape is invalid/);

const validCandidate = {
  code: "8136",
  name: "サンリオ",
  sector: "entertainment",
  detectedAt: "2026-08-17",
  drawdownPct: -20,
  operatingProfitYoY: 12,
  screeningScore: 70,
  matchedWorldEventTags: ["consumer_ip"],
};
const universe = normalizeStockCandidateUniverseRows({
  generatedAt: "2026-08-17",
  candidates: [
    validCandidate,
    null,
    { ...validCandidate, code: "7974", matchedWorldEventTags: {} },
    { ...validCandidate, code: "4661", screeningScore: "70" },
  ],
});
assert.equal(universe.rootValid, true);
assert.deepEqual(universe.candidates.map(candidate => candidate.code), ["8136"], "malformed candidateだけ隔離して正常candidateを保持する");
assert.equal(universe.warnings.length, 3, "malformed candidate rowをsilent dropしない");
assert.ok(universe.warnings.every(warning => !warning.includes("サンリオ")), "candidate warningへraw row内容を露出しない");

const invalidUniverseRoot = normalizeStockCandidateUniverseRows({ candidates: {} });
assert.equal(invalidUniverseRoot.rootValid, false, "non-array candidates rootを空の正常snapshotへ同化しない");
assert.match(invalidUniverseRoot.warnings[0], /candidates root shape is invalid/);

console.log("stock-candidate-hypothesis-input: malformed JSONL/watchlist/universe/outcome/SQLite row isolation OK");
