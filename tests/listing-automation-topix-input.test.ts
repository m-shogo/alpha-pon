import assert from "node:assert/strict";
import { parseListingAutomationTopixInput } from "../src/listing-automation-topix-input.js";

const AS_OF = "2026-08-18";
const base = { generatedAt: AS_OF, rows: [] };

assert.deepEqual(
  parseListingAutomationTopixInput(
    JSON.stringify({ generatedAt: AS_OF, rows: [{ code: "8136", topixRelativeReturn: 0.12 }, { code: "285A", topixRelativeReturn: null }] }),
    AS_OF,
  ),
  {
    rows: [{ code: "8136", topixRelativeReturn: 0.12 }, { code: "285A", topixRelativeReturn: null }],
    invalid: false,
    reason: "ok",
  },
  "canonical current-day TOPIX relative input remains usable",
);

assert.deepEqual(
  parseListingAutomationTopixInput("{", AS_OF),
  { rows: [], invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing listing automation summary",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify([]), AS_OF),
  { rows: [], invalid: true, reason: "invalid_root" },
  "non-object TOPIX root must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: {} }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_root" },
  "non-array TOPIX rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ rows: [] }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_generated_at" },
  "missing generatedAt must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, generatedAt: "2026-02-31" }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_generated_at" },
  "impossible generatedAt dates must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, generatedAt: "2026-08-17" }), AS_OF),
  { rows: [], invalid: true, reason: "stale_generated_at" },
  "previous-day TOPIX reports must not be treated as current listing evidence",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, rows: [null] }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "malformed TOPIX rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, rows: [{ topixRelativeReturn: 0.12 }] }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "TOPIX rows without a company code must not count as valid read-only evidence",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, rows: [{ code: " 8136", topixRelativeReturn: 0.12 }] }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "non-canonical padded TOPIX row identities must fail closed",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, rows: [{ code: "8136", topixRelativeReturn: "0.12" }] }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "non-numeric relative returns must not be treated as valid read-only evidence",
);

assert.deepEqual(
  parseListingAutomationTopixInput(JSON.stringify({ ...base, rows: [{ code: "8136", topixRelativeReturn: Number.POSITIVE_INFINITY }] }), AS_OF),
  { rows: [], invalid: true, reason: "invalid_rows" },
  "non-finite relative returns must fail closed",
);

console.log("listing-automation-topix-input: OK");
