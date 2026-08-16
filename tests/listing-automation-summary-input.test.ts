import assert from "node:assert/strict";
import { listingAutomationReadinessStatus, parseListingAutomationCheckInput } from "../src/listing-automation-summary-input.js";

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

assert.equal(
  listingAutomationReadinessStatus([{ id: "ready", status: "ok" }]),
  "ok",
  "all-ok readiness checks remain green",
);

assert.equal(
  listingAutomationReadinessStatus([{ id: "degraded", status: "warning" }]),
  "warning",
  "readiness warnings must surface in the summary status",
);

assert.equal(
  listingAutomationReadinessStatus([{ id: "missing", status: "missing" }]),
  "warning",
  "missing readiness checks remain warnings",
);

console.log("listing-automation-summary-input: OK");
