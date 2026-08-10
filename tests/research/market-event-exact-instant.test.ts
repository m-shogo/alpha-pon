import assert from "node:assert/strict";
import {
  assertIsoTimestamp,
  assertValidEventTime,
} from "../../src/market-events/contracts.js";

function exactTime(startAt: string, endAt: string | null = null) {
  return {
    startAt,
    endAt,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT" as const,
    windowStart: null,
    windowEnd: null,
  };
}

assert.throws(
  () => assertValidEventTime(exactTime(
    "2026-08-10T14:00:00.000000002Z",
    "2026-08-10T14:00:00.000000001Z",
  )),
  /endAt must be on or after startAt/,
  "a 1ns endAt inversion must not collapse to the same millisecond",
);

assert.doesNotThrow(
  () => assertValidEventTime(exactTime(
    "2026-08-10T14:00:00.000000001Z",
    "2026-08-10T14:00:00.000000002Z",
  )),
  "a +1ns exact interval should remain valid",
);

assert.throws(
  () => assertValidEventTime(exactTime("2026-02-31T14:00:00+09:00")),
  /strict ISO timestamp/,
  "impossible Gregorian exact timestamps must fail closed",
);

assert.throws(
  () => assertValidEventTime(exactTime("2026-08-10T14:00:00")),
  /strict ISO timestamp/,
  "timezone-less exact timestamps must fail closed",
);

assert.throws(
  () => assertIsoTimestamp("2026-08-10T14:00:00", "observedAt"),
  /strict ISO timestamp/,
  "timezone-less provenance timestamps must fail closed",
);

assert.throws(
  () => assertIsoTimestamp("2026-02-31T14:00:00+09:00", "retrievedAt"),
  /strict ISO timestamp/,
  "impossible Gregorian provenance timestamps must fail closed",
);

assert.doesNotThrow(
  () => assertIsoTimestamp("2026-08-10T14:00:00.000000001+09:00", "firstExecutableAt"),
  "strict explicit-timezone provenance timestamps with sub-ms precision must remain valid",
);

console.log("research/market-event-contracts: strict sub-ms exact and provenance instant ordering OK");
