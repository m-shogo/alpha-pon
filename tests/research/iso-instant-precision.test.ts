import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "../../src/research/iso-instant.js";
import { validatePriceRecordTimeline } from "../../src/research/price-record-timeline.js";

function testNanosecondFractionRemainsAccepted() {
  assert.equal(
    parseExplicitIso8601Instant(
      "2026-08-10T01:02:03.123456789Z",
      "timestamp",
    ),
    Date.parse("2026-08-10T01:02:03.123Z"),
  );
  console.log("research/iso-instant: existing nanosecond-fraction parse compatibility OK");
}

function testFullFractionalPrecisionComparison() {
  assert.equal(
    compareExplicitIso8601Instants(
      "2026-08-10T01:02:03.000000001Z",
      "2026-08-10T01:02:03.000000002Z",
    ),
    -1,
  );
  assert.equal(
    compareExplicitIso8601Instants(
      "2026-08-10T10:02:03.123456789+09:00",
      "2026-08-10T01:02:03.123456789Z",
    ),
    0,
  );
  console.log("research/iso-instant: full fractional precision comparison OK");
}

function testPitTimelineDetectsSubMillisecondInversion() {
  const violations = validatePriceRecordTimeline({
    dataAsOf: "2026-08-10T01:02:03.000000000Z",
    observedAt: "2026-08-10T01:02:03.000000002Z",
    retrievedAt: "2026-08-10T01:02:03.000000001Z",
    firstExecutableAt: "2026-08-10T01:02:04.000000000Z",
  });

  assert.ok(
    violations.some((violation) => violation.code === "retrieval_before_observation"),
    "sub-millisecond observed/retrieved inversion must not collapse to one numeric millisecond",
  );
  console.log("research/iso-instant: sub-millisecond PIT inversion detected");
}

function testDocumentRevisionLineageAvoidsMillisecondCollapse() {
  const source = readFileSync(
    new URL("../../src/research/document-revision-diff.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /Date\.parse\(/,
    "document revision lineage ordering must not collapse fractional precision through Date.parse",
  );
  assert.match(
    source,
    /compareExplicitIso8601Instants\(record\.observedAt, previous\.observedAt\) <= 0/,
  );
  assert.match(
    source,
    /compareExplicitIso8601Instants\(record\.retrievedAt, previous\.retrievedAt\) <= 0/,
  );
  console.log("research/iso-instant: document revision lineage uses full instant precision");
}

testNanosecondFractionRemainsAccepted();
testFullFractionalPrecisionComparison();
testPitTimelineDetectsSubMillisecondInversion();
testDocumentRevisionLineageAvoidsMillisecondCollapse();

console.log("research/iso-instant: precision regression tests passed");
