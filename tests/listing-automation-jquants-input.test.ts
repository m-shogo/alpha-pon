import assert from "node:assert/strict";
import { parseListingAutomationJquantsInput } from "../src/listing-automation-jquants-input.js";

const AS_OF = "2026-08-18";
const base = { generatedAt: AS_OF, targets: [], results: [], setupError: null };

assert.deepEqual(
  parseListingAutomationJquantsInput(
    JSON.stringify({ generatedAt: AS_OF, targets: [{ code: "8136" }], results: [{ price: 1234, source: "jquants" }], setupError: null }),
    AS_OF,
  ),
  {
    targets: [{ code: "8136" }],
    results: [{ price: 1234, source: "jquants" }],
    setupError: null,
    invalid: false,
    reason: "ok",
  },
  "canonical current-day J-Quants listing input remains usable",
);

assert.deepEqual(
  parseListingAutomationJquantsInput("{", AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing listing automation summary",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify([]), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_root" },
  "non-object J-Quants root must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [], results: [], setupError: null }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_generated_at" },
  "missing generatedAt must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, generatedAt: "2026-02-31" }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_generated_at" },
  "impossible generatedAt dates must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, generatedAt: "2026-08-17" }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "stale_generated_at" },
  "previous-day J-Quants reports must not be treated as current listing evidence",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, targets: {} }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_targets" },
  "non-array targets must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, results: {} }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_results" },
  "non-array results must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, results: [null] }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_rows" },
  "malformed result rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, results: [{ price: "1234", source: "jquants" }] }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_rows" },
  "non-numeric prices must not be treated as valid read-only price evidence",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, results: [{ price: 1234, source: "synthetic" }] }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_rows" },
  "unknown source provenance must fail closed instead of being treated as J-Quants price evidence",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ ...base, setupError: {} }), AS_OF),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_setup_error" },
  "malformed setupError must fail closed",
);

console.log("listing-automation-jquants-input: OK");
