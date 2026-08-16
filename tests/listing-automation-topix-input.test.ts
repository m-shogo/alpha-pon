import assert from "node:assert/strict";
import { parseListingAutomationTopixInput } from "../src/listing-automation-topix-input.js";

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: [{ topixRelativeReturn: 0.12 }, { topixRelativeReturn: null }] })),
  {
    rows: [{ topixRelativeReturn: 0.12 }, { topixRelativeReturn: null }],
    invalid: false,
    reason: "ok",
  },
  "canonical TOPIX relative input remains usable",
);

assert.deepEqual(
  parseListingAutomationTopixInput("{"),
  { rows: [], invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing listing automation summary",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify([])),
  { rows: [], invalid: true, reason: "invalid_root" },
  "non-object TOPIX root must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: {} })),
  { rows: [], invalid: true, reason: "invalid_root" },
  "non-array TOPIX rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: [null] })),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "malformed TOPIX rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: [{ topixRelativeReturn: "0.12" }] })),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "non-numeric relative returns must not be treated as valid read-only evidence",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: [{ topixRelativeReturn: Number.POSITIVE_INFINITY }] })),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "non-finite relative returns must fail closed",
);

console.log("listing-automation-topix-input: OK");
