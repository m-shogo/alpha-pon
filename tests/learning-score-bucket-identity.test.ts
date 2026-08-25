import assert from "node:assert/strict";
import { parseLearningScoreInput } from "../src/learning-score-input.js";

const base = {
  code: "8136",
  name: "サンリオ",
  priority: "S",
  tags: ["entertainment"],
  rules: ["healthy_pullback"],
  score: 72,
  alertLevel: "daily",
  createdAt: "2026-08-21",
};

const parsed = parseLearningScoreInput(JSON.stringify([
  base,
  { ...base, code: "4661", priority: " S " },
  { ...base, code: "7832", tags: [" entertainment "] },
  { ...base, code: "7974", rules: ["healthy_pullback "] },
  { ...base, code: "7011", tags: [""] },
]), "2026-08-21");

assert.ok(parsed);
assert.deepEqual(
  parsed.entries.map(entry => entry.code),
  ["8136"],
  "padded or blank learning bucket identities must not split read-only aggregation",
);
assert.deepEqual(parsed.invalidRows, [2, 3, 4, 5]);

console.log("learning score bucket identity tests passed");
