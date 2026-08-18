import assert from "node:assert/strict";
import { parseListingAutomationJquantsInput } from "../src/listing-automation-jquants-input.js";

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [{ code: "8136" }], results: [{ price: 1234, source: "jquants" }], setupError: null })),
  {
    targets: [{ code: "8136" }],
    results: [{ price: 1234, source: "jquants" }],
    setupError: null,
    invalid: false,
    reason: "ok",
  },
  "canonical J-Quants listing input remains usable",
);

assert.deepEqual(
  parseListingAutomationJquantsInput("{"),
  { targets: [], results: [], setupError: null, invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing listing automation summary",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify([])),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_root" },
  "non-object J-Quants root must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: {}, results: [] })),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_targets" },
  "non-array targets must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [], results: {} })),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_results" },
  "non-array results must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [], results: [null] })),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_rows" },
  "malformed result rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [], results: [{ price: "1234", source: "jquants" }] })),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_rows" },
  "non-numeric prices must not be treated as valid read-only price evidence",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [], results: [{ price: 1234, source: "synthetic" }] })),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_rows" },
  "unknown source provenance must fail closed instead of being treated as J-Quants price evidence",
);

assert.deepEqual(
  parseListingAutomationJquantsInput(JSON.stringify({ targets: [], results: [], setupError: {} })),
  { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_setup_error" },
  "malformed setupError must fail closed",
);

console.log("listing-automation-jquants-input: OK");