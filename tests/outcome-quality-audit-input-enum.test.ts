import assert from "node:assert/strict";
import {
  isQualityHypothesisLike,
  isQualityOutcomeLike,
} from "../src/outcome-quality-audit-input.js";

const hypothesis = {
  code: "8136",
  name: "サンリオ",
  detectedAt: "2026-08-19",
  reviewDueAt: "2026-09-18",
  expectedTimeframe: "1m",
  expectedDirection: "up",
};

const outcome = {
  code: "8136",
  name: "サンリオ",
  reviewHorizon: "1d",
  result: "unknown",
  dataAvailability: "ok",
  actualDirection: "unknown",
  whatMatched: [],
  missedSignals: [],
  notes: "reviewed",
  hypothesis,
};

assert.equal(isQualityHypothesisLike(hypothesis), true);
assert.equal(isQualityOutcomeLike(outcome), true);

for (const [field, value] of [
  ["reviewHorizon", "tomorrow"],
  ["result", "success"],
  ["dataAvailability", "ready"],
  ["actualDirection", "flat-ish"],
] as const) {
  assert.equal(
    isQualityOutcomeLike({ ...outcome, [field]: value }),
    false,
    `unknown ${field} must fail closed`,
  );
}

for (const field of ["reviewHorizon", "result", "dataAvailability", "actualDirection"] as const) {
  const truncated = { ...outcome } as Record<string, unknown>;
  delete truncated[field];
  assert.equal(
    isQualityOutcomeLike(truncated),
    false,
    `missing ${field} must fail closed`,
  );
}

assert.equal(
  isQualityHypothesisLike({ ...hypothesis, expectedTimeframe: "2w" }),
  false,
  "unknown expectedTimeframe must fail closed",
);
assert.equal(
  isQualityHypothesisLike({ ...hypothesis, expectedDirection: "bullish" }),
  false,
  "unknown expectedDirection must fail closed",
);

console.log("outcome-quality-input: canonical enums and required outcome fields fail closed");
