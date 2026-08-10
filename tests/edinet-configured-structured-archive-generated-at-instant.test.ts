import assert from "node:assert/strict";
import { buildConfiguredStructuredTextArchive } from "../src/research/edinet-configured-fidelity-local-extraction.js";

const base = {
  docID: "S900ROOT",
  sourceBinarySha256: "a".repeat(64),
  entries: [{ path: "XBRL/PublicDoc/a.htm", text: "synthetic line" }],
};

assert.throws(
  () => buildConfiguredStructuredTextArchive({
    ...base,
    generatedAt: "2026-08-06T15:20:00",
  }),
  /generatedAt must be an ISO-8601 timestamp with explicit timezone/,
);

assert.throws(
  () => buildConfiguredStructuredTextArchive({
    ...base,
    generatedAt: "2026-02-30T15:20:00Z",
  }),
  /generatedAt must be a valid Gregorian ISO-8601 timestamp/,
);

assert.throws(
  () => buildConfiguredStructuredTextArchive({
    ...base,
    generatedAt: "2026-08-06T15:20:00+14:01",
  }),
  /generatedAt must have a valid timezone offset within ±14:00/,
);

console.log("edinet-configured-structured-archive-generated-at-instant.test.ts passed");
