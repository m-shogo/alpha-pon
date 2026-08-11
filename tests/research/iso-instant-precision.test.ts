import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "../../src/research/iso-instant.js";
import { evaluateGate, type HoldoutAccessEntry } from "../../src/research/promotion.js";
import { validatePriceRecordTimeline } from "../../src/research/price-record-timeline.js";
import { GATE_KEYS, type Edge } from "../../src/research/types.js";
import { makeEdge, makeState } from "./helpers.js";

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

function testHoldoutLatestResultUsesNanosecondPrecision() {
  const edge = makeEdge();
  for (const key of GATE_KEYS) {
    edge.promotionGate[key] = { state: "pass", evidence: `precision test ${key}`, checkedAt: "2024-02-01" };
  }
  edge.samples.current = edge.samples.required;

  const base: HoldoutAccessEntry = {
    schemaVersion: 1,
    id: "holdout-base",
    edgeId: edge.id,
    windowId: "precision-window",
    openedAt: "2024-02-01T10:00:00.000000001+09:00",
    actor: "test",
    purpose: "production_gate",
    result: "fail",
  };
  const latestPass: HoldoutAccessEntry = {
    ...base,
    id: "holdout-latest-pass",
    openedAt: "2024-02-01T10:00:00.000000002+09:00",
    result: "pass",
  };

  const evaluation = evaluateGate(edge as Edge, makeState({ edges: [edge] }), [base, latestPass], "2024-02-01");
  assert.equal(
    evaluation.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
    false,
    "later +1ns PASS must supersede earlier FAIL instead of collapsing into a same-millisecond conflict",
  );
  console.log("research/iso-instant: Holdout latest-result ordering preserves nanosecond precision");
}

testNanosecondFractionRemainsAccepted();
testFullFractionalPrecisionComparison();
testPitTimelineDetectsSubMillisecondInversion();
testDocumentRevisionLineageAvoidsMillisecondCollapse();
testHoldoutLatestResultUsesNanosecondPrecision();

console.log("research/iso-instant: precision regression tests passed");
