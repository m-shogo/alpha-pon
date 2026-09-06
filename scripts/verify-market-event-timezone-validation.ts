import assert from "node:assert/strict";
import { assertValidEventTime } from "../src/market-events/contracts.js";

assert.doesNotThrow(() => assertValidEventTime({
  startAt: "2026-09-07T09:00:00+09:00",
  endAt: null,
  allDay: false,
  timezone: "Asia/Tokyo",
  precision: "EXACT",
  windowStart: null,
  windowEnd: null,
}));

assert.doesNotThrow(() => assertValidEventTime({
  startAt: null,
  endAt: null,
  allDay: false,
  timezone: "UTC",
  precision: "UNKNOWN",
  windowStart: null,
  windowEnd: null,
}));

for (const time of [
  {
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: "Mars/Olympus",
    precision: "UNKNOWN" as const,
    windowStart: null,
    windowEnd: null,
  },
  {
    startAt: "2026-09-07",
    endAt: null,
    allDay: true,
    timezone: "Mars/Olympus",
    precision: "DATE_ONLY" as const,
    windowStart: null,
    windowEnd: null,
  },
  {
    startAt: null,
    endAt: null,
    allDay: true,
    timezone: "Mars/Olympus",
    precision: "WINDOW" as const,
    windowStart: "2026-09-07",
    windowEnd: "2026-09-08",
  },
] as const) {
  assert.throws(
    () => assertValidEventTime(time),
    /Invalid event timezone: Mars\/Olympus/,
    `${time.precision} EventTime must reject an invalid IANA timezone before it can pass validation`,
  );
}

console.log("market-event-timezone-validation: ok");
