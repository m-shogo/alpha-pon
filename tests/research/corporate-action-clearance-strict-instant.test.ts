import assert from "node:assert/strict";
import {
  computeCorporateActionClearanceHash,
  withCorporateActionClearanceHash,
  type CorporateActionClearanceRecord,
} from "../../src/research/corporate-action-clearance.js";

const base = {
  schemaVersion: 1 as const,
  clearanceId: "ca-clearance:strict-instant-fixture",
  assessedAt: "2026-08-14T10:00:00+09:00",
  assessmentMethod: "official-corporate-action-clearance-v1" as const,
  code: "81360",
  market: "TSE",
  source: "synthetic-outcome-fixture",
  providerPlan: "synthetic" as const,
  fromTradingDate: "2026-08-06",
  throughTradingDate: "2026-08-12",
  status: "clear" as const,
  sourceEvidence: [{ tier: "A" as const, ref: "synthetic:official:corporate-action:001" }],
  automaticTradingAuthorized: false as const,
};

const valid = withCorporateActionClearanceHash(base);
assert.equal(computeCorporateActionClearanceHash(valid), valid.contentHash);

for (const assessedAt of [
  "2026-08-14T10:00:00",
  "2026-02-30T10:00:00+09:00",
  "2026-08-14T10:00:00+15:00",
]) {
  assert.throws(
    () => withCorporateActionClearanceHash({ ...base, assessedAt }),
    /assessedAt/,
    `withCorporateActionClearanceHash must reject noncanonical assessedAt: ${assessedAt}`,
  );

  const forged = {
    ...base,
    assessedAt,
    contentHash: "0".repeat(64),
  } satisfies CorporateActionClearanceRecord;
  assert.throws(
    () => computeCorporateActionClearanceHash(forged),
    /assessedAt/,
    `hash recomputation must reject noncanonical assessedAt: ${assessedAt}`,
  );
}

for (const override of [
  { fromTradingDate: "0000" },
  { fromTradingDate: "2026-02-30" },
  { throughTradingDate: "9999" },
  { throughTradingDate: "2026-02-30" },
]) {
  assert.throws(
    () => withCorporateActionClearanceHash({ ...base, ...override }),
    /TradingDate/,
    `withCorporateActionClearanceHash must reject malformed trading window: ${JSON.stringify(override)}`,
  );

  const forged = {
    ...base,
    ...override,
    contentHash: "0".repeat(64),
  } satisfies CorporateActionClearanceRecord;
  assert.throws(
    () => computeCorporateActionClearanceHash(forged),
    /TradingDate/,
    `hash recomputation must reject malformed trading window: ${JSON.stringify(override)}`,
  );
}

console.log("corporate-action-clearance-strict-instant.test.ts passed");
