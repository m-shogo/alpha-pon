import assert from "node:assert/strict";
import { listingAutomationReadinessStatus, parseListingAutomationCheckInput } from "../src/listing-automation-summary-input.js";

const AS_OF = "2026-08-18";
const VALID = { id: "fixture", status: "ok" };
const base = { generatedAt: AS_OF, checks: [VALID] };

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify(base), AS_OF),
  { checks: [VALID], invalid: false, reason: "ok" },
  "canonical current-day check arrays remain usable",
);

assert.deepEqual(
  parseListingAutomationCheckInput("{", AS_OF),
  { checks: [], invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing the listing summary",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify([]), AS_OF),
  { checks: [], invalid: true, reason: "invalid_root" },
  "non-object roots must fail closed",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ checks: [VALID] }), AS_OF),
  { checks: [], invalid: true, reason: "invalid_generated_at" },
  "missing generatedAt must fail closed",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, generatedAt: "2026-02-31" }), AS_OF),
  { checks: [], invalid: true, reason: "invalid_generated_at" },
  "impossible generatedAt dates must fail closed",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, generatedAt: "2026-08-17" }), AS_OF),
  { checks: [], invalid: true, reason: "stale_generated_at" },
  "previous-day readiness or smoke reports must not be treated as current evidence",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, checks: {} }), AS_OF),
  { checks: [], invalid: true, reason: "invalid_checks" },
  "non-array checks must fail closed",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, checks: [] }), AS_OF),
  { checks: [], invalid: true, reason: "invalid_checks" },
  "empty check arrays must not become a false-green readiness or smoke summary",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, checks: [VALID, null] }), AS_OF),
  { checks: [VALID], invalid: true, reason: "invalid_rows" },
  "malformed check rows must not crash count-based summary logic",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, checks: [{ id: "unknown", status: "passed" }] }), AS_OF),
  { checks: [{ id: "unknown", status: "passed" }], invalid: true, reason: "invalid_rows" },
  "unknown statuses must fail closed instead of becoming a false-green summary",
);

assert.deepEqual(
  parseListingAutomationCheckInput(JSON.stringify({ ...base, checks: [{ id: "missing-status" }] }), AS_OF),
  { checks: [{ id: "missing-status" }], invalid: true, reason: "invalid_rows" },
  "missing statuses must fail closed",
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

assert.equal(
  listingAutomationReadinessStatus([{ id: "failed", status: "fail" }]),
  "fail",
  "failed readiness checks must not become a false-green summary",
);

console.log("listing-automation-summary-input: OK");
