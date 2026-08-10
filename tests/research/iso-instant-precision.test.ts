import assert from "node:assert/strict";
import { parseExplicitIso8601Instant } from "../../src/research/iso-instant.js";
import { validatePriceRecordTimeline } from "../../src/research/price-record-timeline.js";

function testMillisecondPrecisionAccepted() {
  const parsed = parseExplicitIso8601Instant(
    "2026-08-10T01:02:03.123Z",
    "timestamp",
  );
  assert.equal(parsed, Date.parse("2026-08-10T01:02:03.123Z"));
  console.log("research/iso-instant: millisecond precision OK");
}

function testSubMillisecondPrecisionRejected() {
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-10T01:02:03.1234Z", "timestamp"),
    /must not exceed millisecond precision/,
  );
  assert.throws(
    () => parseExplicitIso8601Instant("2026-08-10T01:02:03.123456789+09:00", "timestamp"),
    /must not exceed millisecond precision/,
  );
  console.log("research/iso-instant: sub-millisecond precision rejected");
}

function testPitTimelineCannotCollapseSubMillisecondOrdering() {
  const violations = validatePriceRecordTimeline({
    dataAsOf: "2026-08-10T01:02:03.000Z",
    observedAt: "2026-08-10T01:02:03.000000002Z",
    retrievedAt: "2026-08-10T01:02:03.000000001Z",
    firstExecutableAt: "2026-08-10T01:02:04.000Z",
  });

  assert.ok(
    violations.some((violation) => violation.code === "invalid_timestamp"),
    "sub-millisecond observed/retrieved ordering must fail closed instead of collapsing to one millisecond",
  );
  console.log("research/iso-instant: sub-millisecond PIT ordering fails closed");
}

testMillisecondPrecisionAccepted();
testSubMillisecondPrecisionRejected();
testPitTimelineCannotCollapseSubMillisecondOrdering();

console.log("research/iso-instant: precision regression tests passed");
