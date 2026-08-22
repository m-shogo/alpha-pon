import assert from "node:assert/strict";
import { normalizeWorldThemeCandidateEventInput } from "../src/world-theme-candidate-hypothesis-input.js";

const valid = [{ title: "official event", impacts: [] }];
const normalized = normalizeWorldThemeCandidateEventInput(valid);
assert.equal(normalized.status, "ok");
assert.deepEqual(normalized.events, valid);

for (const malformed of [{ events: valid }, {}, null, "[]", 1]) {
  const result = normalizeWorldThemeCandidateEventInput(malformed);
  assert.equal(result.status, "invalid_root");
  assert.deepEqual(result.events, []);
}

console.log("world-theme-candidate-hypothesis-input.test.ts passed");
