import assert from "node:assert/strict";
import { validateLedgerRecord } from "../src/market-events/local-ledger.js";

const baseRecord = {
  recordType: "EVENT_REVISION" as const,
  recordedAt: "2026-08-28T10:30:00Z",
  payload: {
    schemaVersion: 1 as const,
    revisionId: "rev_fixture",
    eventId: "evt_fixture",
    revisionNumber: 1,
    observedAt: "2026-08-28T10:00:00Z",
    publishedAt: null as string | null,
    effectiveAt: null as string | null,
    firstExecutableAt: null as string | null,
    changeType: "CREATED" as const,
    facts: {},
    sourceIds: [],
    previousRevisionId: null,
  },
};

for (const fieldName of ["publishedAt", "effectiveAt", "firstExecutableAt"] as const) {
  assert.throws(
    () => validateLedgerRecord({
      ...baseRecord,
      payload: {
        ...baseRecord.payload,
        [fieldName]: "not-a-timestamp",
      },
    }),
    new RegExp(`${fieldName} must be a strict ISO timestamp`),
    `${fieldName} must not enter read-only ledger projection as an arbitrary string`,
  );
}

validateLedgerRecord({
  ...baseRecord,
  payload: {
    ...baseRecord.payload,
    publishedAt: "2026-08-28T09:00:00Z",
    effectiveAt: "2026-08-28T09:30:00+00:00",
    firstExecutableAt: "2026-08-28T10:30:00Z",
  },
});

console.log("market event ledger revision instants: fail-closed OK");
