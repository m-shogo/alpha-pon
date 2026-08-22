import assert from "node:assert/strict";
import {
  normalizeWorldThemeCandidateEventInput,
  normalizeWorldThemeCandidateWatchlistInput,
} from "../src/world-theme-candidate-hypothesis-input.js";

const valid = [{ title: "official event", totalImpactScore: 80, impacts: [{ category: "ai_compute", impactedTags: ["AI"] }] }];
const normalized = normalizeWorldThemeCandidateEventInput(valid);
assert.equal(normalized.status, "ok");
assert.deepEqual(normalized.events, valid);

for (const malformed of [{ events: valid }, {}, null, "[]", 1]) {
  const result = normalizeWorldThemeCandidateEventInput(malformed);
  assert.equal(result.status, "invalid_root");
  assert.deepEqual(result.events, []);
}

for (const malformedRows of [
  [{ title: "broken impacts", impacts: {} }],
  [{ title: "broken tags", impacts: [{ impactedTags: "AI" }] }],
  [{ title: "broken score", totalImpactScore: Number.NaN, impacts: [] }],
  [{ title: "", impacts: [] }],
]) {
  const result = normalizeWorldThemeCandidateEventInput(malformedRows);
  assert.equal(result.status, "invalid_rows");
  assert.deepEqual(result.events, []);
}

const validWatchlist = {
  priorityWatches: [
    {
      code: "7974",
      name: "任天堂",
      category: "game",
      reasonSummary: "重点ウォッチ",
      nextCheck: "公式IR",
    },
  ],
};
const normalizedWatchlist = normalizeWorldThemeCandidateWatchlistInput(validWatchlist);
assert.equal(normalizedWatchlist.status, "ok");
assert.deepEqual(normalizedWatchlist.watchlist, validWatchlist);

for (const malformedRoot of [null, [], "watchlist", 1]) {
  const result = normalizeWorldThemeCandidateWatchlistInput(malformedRoot);
  assert.equal(result.status, "invalid_root");
  assert.deepEqual(result.watchlist.priorityWatches, []);
}

for (const malformedRows of [
  { priorityWatches: "7974" },
  { priorityWatches: [{}] },
  { priorityWatches: [{ code: "", name: "任天堂" }] },
  { priorityWatches: [{ code: " 7974 ", name: "任天堂" }] },
  { priorityWatches: [{ code: "7974", name: " 任天堂 " }] },
  { priorityWatches: [{ code: "7974", name: "任天堂", category: 123 }] },
]) {
  const result = normalizeWorldThemeCandidateWatchlistInput(malformedRows);
  assert.equal(result.status, "invalid_rows");
  assert.deepEqual(result.watchlist.priorityWatches, []);
}

console.log("world-theme-candidate-hypothesis-input.test.ts passed");
