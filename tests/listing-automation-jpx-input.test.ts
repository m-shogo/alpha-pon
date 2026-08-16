import assert from "node:assert/strict";
import { parseListingAutomationJpxInput } from "../src/listing-automation-jpx-input.js";

const VALID = { code: "8136" };

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ parsed: [VALID], appendable: [VALID], sourceUrl: "https://example.test/jpx" })),
  {
    parsed: [VALID],
    appendable: [VALID],
    sourceUrl: "https://example.test/jpx",
    error: undefined,
    invalid: false,
    reason: "ok",
  },
  "canonical JPX sync input remains usable",
);

assert.deepEqual(
  parseListingAutomationJpxInput("{"),
  { parsed: [], appendable: [], invalid: true, reason: "parse_error" },
  "malformed JSON must fail closed instead of crashing listing automation summary",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify([])),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_root" },
  "non-object JPX root must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ parsed: {}, appendable: [] })),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_parsed" },
  "non-array parsed rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ parsed: [], appendable: {} })),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_appendable" },
  "non-array appendable rows must fail closed",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ parsed: [VALID, null], appendable: [VALID] })),
  { parsed: [VALID], appendable: [VALID], invalid: true, reason: "invalid_rows" },
  "malformed JPX rows must be isolated and surfaced as invalid",
);

console.log("listing-automation-jpx-input: OK");
