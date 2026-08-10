import assert from "node:assert/strict";
import { buildSanrioEdinetInventory } from "../src/fetcher/edinet-sanrio-pilot.js";

const base = {
  from: "2026-08-06",
  to: "2026-08-06",
  scannedBusinessDays: 1,
  failedDates: [],
  docs: [],
};

assert.throws(
  () => buildSanrioEdinetInventory({
    ...base,
    generatedAt: "2026-08-06T11:00:00",
  }),
  /generatedAt must be an ISO-8601 timestamp with explicit timezone/,
);

assert.throws(
  () => buildSanrioEdinetInventory({
    ...base,
    generatedAt: "2026-02-30T11:00:00Z",
  }),
  /generatedAt must be a valid Gregorian ISO-8601 timestamp/,
);

assert.throws(
  () => buildSanrioEdinetInventory({
    ...base,
    generatedAt: "2026-08-06T11:00:00+14:01",
  }),
  /generatedAt must have a valid timezone offset within ±14:00/,
);

console.log("edinet-sanrio-pilot-generated-at-instant.test.ts passed");
