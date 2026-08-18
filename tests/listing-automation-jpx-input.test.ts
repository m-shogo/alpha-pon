import assert from "node:assert/strict";
import { parseListingAutomationJpxInput } from "../src/listing-automation-jpx-input.js";

const AS_OF = "2026-08-18";
const VALID = { code: "8136" };
const base = { generatedAt: AS_OF, parsed: [], appendable: [] };

assert.deepEqual(
  parseListingAutomationJpxInput(
    JSON.stringify({ generatedAt: AS_OF, parsed: [VALID], appendable: [VALID], sourceUrl: "https://example.test/jpx" }),
    AS_OF,
  ),
  {
    parsed: [VALID],
    appendable: [VALID],
    sourceUrl: "https://example.test/jpx",
    error: undefined,
    invalid: false,
    reason: "ok",
  },
  "canonical current-day JPX sync input remains usable",
);

assert.deepEqual(
  parseListingAutomationJpxInput("{", AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing listing automation summary",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify([]), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_root" },
  "non-object JPX root must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ parsed: [], appendable: [] }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_generated_at" },
  "missing generatedAt must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, generatedAt: "2026-02-31" }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_generated_at" },
  "impossible generatedAt dates must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, generatedAt: "2026-08-17" }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "stale_generated_at" },
  "previous-day JPX reports must not be treated as current listing evidence",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, parsed: {} }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_parsed" },
  "non-array parsed rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, appendable: {} }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_appendable" },
  "non-array appendable rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, parsed: [VALID, null], appendable: [VALID] }), AS_OF),
  { parsed: [VALID], appendable: [VALID], invalid: true, reason: "invalid_rows" },
  "malformed JPX rows must be isolated and surfaced as invalid",
);

console.log("listing-automation-jpx-input: OK");
