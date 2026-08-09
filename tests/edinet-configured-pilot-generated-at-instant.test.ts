import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildConfiguredEdinetInventory } from "../src/fetcher/edinet-configured-pilot.js";
import { buildEdinetIssuerRegistry, resolveEdinetIssuerBoundary } from "../src/research/edinet-issuer-boundary.js";

const registry = buildEdinetIssuerRegistry(JSON.parse(
  readFileSync("config/research/edinet-issuer-registry.v1.json", "utf-8"),
) as unknown);
const boundary = resolveEdinetIssuerBoundary(registry, "sanrio");

const base = {
  boundary,
  registryHash: registry.registryHash,
  from: "2026-08-06",
  to: "2026-08-06",
  scannedBusinessDays: 1,
  failedDates: [],
  docs: [],
};

assert.throws(
  () => buildConfiguredEdinetInventory({
    ...base,
    generatedAt: "2026-08-06T11:00:00",
  }),
  /generatedAt must be an ISO-8601 timestamp with explicit timezone/,
);

assert.throws(
  () => buildConfiguredEdinetInventory({
    ...base,
    generatedAt: "2026-02-30T11:00:00Z",
  }),
  /generatedAt must be a valid Gregorian ISO-8601 timestamp/,
);

assert.throws(
  () => buildConfiguredEdinetInventory({
    ...base,
    generatedAt: "2026-08-06T11:00:00+14:01",
  }),
  /generatedAt must have a valid timezone offset within ±14:00/,
);

console.log("edinet-configured-pilot-generated-at-instant.test.ts passed");
