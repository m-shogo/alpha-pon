import assert from "node:assert/strict";
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

console.log("stock-candidate-hypothesis-input: malformed JSONL/watchlist/universe row isolation OK");
