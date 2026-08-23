import assert from "node:assert/strict";
import { parseListingAutomationJpxInput } from "../src/listing-automation-jpx-input.js";

const AS_OF = "2026-08-18";
const VALID_PARSED = {
  code: "8136",
  name: "Sanrio",
  listingDate: AS_OF,
  sourceUrl: "https://example.test/jpx",
  raw: "8136,Sanrio,2026-08-18",
  parser: "csv_like",
};
const VALID_APPENDABLE = {
  id: "jpx-8136-2026-08-18",
  code: "8136",
  name: "Sanrio",
  eventType: "listing_day",
  eventDate: AS_OF,
  source: "jpx_listing_sync:csv_like",
  sourceUrl: "https://example.test/jpx",
  status: "watch",
  notificationLevel: "priority",
};
const base = { generatedAt: AS_OF, parsed: [], appendable: [] };

assert.deepEqual(
  parseListingAutomationJpxInput(
    JSON.stringify({ generatedAt: AS_OF, parsed: [VALID_PARSED], appendable: [VALID_APPENDABLE], sourceUrl: "https://example.test/jpx" }),
    AS_OF,
  ),
  {
    parsed: [VALID_PARSED],
    appendable: [VALID_APPENDABLE],
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
  parseListingAutomationJpxInput(JSON.stringify({ ...base, parsed: [VALID_PARSED, null], appendable: [VALID_APPENDABLE] }), AS_OF),
  { parsed: [VALID_PARSED], appendable: [VALID_APPENDABLE], invalid: true, reason: "invalid_rows" },
  "malformed JPX rows must be isolated and surfaced as invalid",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, parsed: [{}] }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_rows" },
  "empty objects must not create a false parsed count or healthy JPX sync status",
);

assert.deepEqual(
  parseListingAutomationJpxInput(JSON.stringify({ ...base, appendable: [{}] }), AS_OF),
  { parsed: [], appendable: [], invalid: true, reason: "invalid_rows" },
  "empty objects must not create false appendable listing evidence",
);

console.log("listing-automation-jpx-input: OK");
