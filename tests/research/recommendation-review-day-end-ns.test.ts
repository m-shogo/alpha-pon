import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/research/recommendation-persistence.ts", "utf-8");

assert.match(
  source,
  /outcomeReviewDate\}T23:59:59\.999999999\+09:00/,
  "outcomeReviewDate must include the final nanosecond of the JST review day",
);
assert.doesNotMatch(
  source,
  /outcomeReviewDate\}T23:59:59\+09:00/,
  "second-precision review-day cutoff must not return",
);

console.log("recommendation-review-day-end-ns: final JST nanosecond is preserved OK");
