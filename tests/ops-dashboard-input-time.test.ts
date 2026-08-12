import assert from "node:assert/strict";
import {
  jstDateFromExplicitInstant,
  normalizeOpsAlphaGeneratedAt,
} from "../src/ops-dashboard-input-time.js";

assert.equal(
  jstDateFromExplicitInstant("2026-08-11T15:30:00Z"),
  "2026-08-12",
  "UTC previous-day timestamp must map to the current JST date",
);
assert.equal(
  jstDateFromExplicitInstant("2026-08-12T00:30:00+09:00"),
  "2026-08-12",
  "explicit JST timestamp must preserve its JST date",
);
assert.deepEqual(
  normalizeOpsAlphaGeneratedAt({ generatedAt: "2026-08-11T15:30:00Z", warnings: [] }),
  { generatedAt: "2026-08-12", warnings: [] },
  "ops dashboard input must compare timestamp generatedAt using the Tokyo calendar date",
);
assert.deepEqual(
  normalizeOpsAlphaGeneratedAt({ generatedAt: "2026-08-12", warnings: [] }),
  { generatedAt: "2026-08-12", warnings: [] },
  "existing date-only generatedAt contract must remain supported",
);
assert.throws(
  () => jstDateFromExplicitInstant("2026-08-12T00:30:00"),
  /explicit timezone/,
  "timezone-less generatedAt must fail closed",
);
assert.throws(
  () => jstDateFromExplicitInstant("2026-02-30T00:30:00+09:00"),
  /valid Gregorian/,
  "non-Gregorian generatedAt must fail closed",
);

console.log("ops-dashboard-input-time: JST generatedAt boundary OK");
