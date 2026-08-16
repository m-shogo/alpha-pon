import assert from "node:assert/strict";
import { parseListingAutomationCheckInput } from "../src/listing-automation-summary-input.js";

const VALID = { id: "fixture", status: "ok" };

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ checks: [VALID] })),
  { checks: [VALID], invalid: false, reason: "ok" },
  "canonical check arrays remain usable",
);

assert.deepEqual(
  parseListingAutomationCheckInput("{"),
  { checks: [], invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing the listing summary",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify([])),
  { checks: [], invalid: true, reason: "invalid_root" },
  "non-object roots must fail closed",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ checks: {} })),
  { checks: [], invalid: true, reason: "invalid_checks" },
  "non-array checks must fail closed",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ checks: [VALID, null] })),
  { checks: [VALID], invalid: true, reason: "invalid_rows" },
  "malformed check rows must not crash count-based summary logic",
);

console.log("listing-automation-summary-input: OK");
