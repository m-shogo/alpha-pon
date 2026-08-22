import assert from "node:assert/strict";
import { normalizeWorldThemeCandidateHypothesisHistory } from "../src/world-theme-candidate-hypothesis-history-input.js";

const valid = normalizeWorldThemeCandidateHypothesisHistory([
  JSON.stringify({ hypothesisId: "2026-08-23__ai__8136__event-a" }),
  JSON.stringify({ hypothesisId: "2026-08-23__semis__6758__event-b" }),
  "",
].join("\n"));
assert.equal(valid.status, "ok");
assert.deepEqual([...valid.ids], [
  "2026-08-23__ai__8136__event-a",
  "2026-08-23__semis__6758__event-b",
]);

for (const malformed of [
  "{broken-json",
  JSON.stringify(null),
  JSON.stringify([]),
  JSON.stringify({}),
  JSON.stringify({ hypothesisId: "" }),
  JSON.stringify({ hypothesisId: " padded-id " }),
]) {
  const result = normalizeWorldThemeCandidateHypothesisHistory(malformed);
  assert.equal(result.status, "invalid_history");
  assert.equal(result.ids.size, 0);
}

const partial = normalizeWorldThemeCandidateHypothesisHistory([
  JSON.stringify({ hypothesisId: "valid-id" }),
  "{broken-json",
].join("\n"));
assert.equal(partial.status, "invalid_history");
assert.equal(partial.ids.size, 0);

console.log("world-theme-candidate-hypothesis-history-input.test.ts passed");
