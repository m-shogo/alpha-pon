import "./price-store.test.js";
import "./price-store-hardening.test.js";
import "./price-store-hardening-subms-replay.test.js";
import "./price-store-provider-query-subms-cutoff.test.js";
import "./price-store-replay-guard.test.js";
import "./price-store-replay-manifest-strict-instant.test.js";
import "./price-store-validation-subms.test.js";
import "./document-revision-diff-rejected-fractional-ordering.test.js";
import "./stock-pro-council-ledger-fractional-ordering.test.js";
import "./market-event-ledger-subms-projection.test.js";
import "./market-event-freshness-subms.test.js";
import "./market-event-exact-instant.test.js";
import "./bitemporal-evidence-subms.test.js";
import assert from "node:assert/strict";
import { canEnterSameClose, checkPit, jstDateOf } from "../../src/research/pit.js";
import { makeAnalog, makeEdge, makeState } from "./helpers.js";

const NOW = new Date("2026-08-04T12:00:00+09:00");

function codes(state: Parameters<typeof checkPit>[0]): string[] {
  return checkPit(state, NOW).map((issue) => issue.code);
}

function testJstConversion() {
  assert.equal(jstDateOf("2026-08-04T00:30:00+09:00"), "2026-08-04");
  assert.equal(jstDateOf("2026-08-03T16:00:00Z"), "2026-08-04", "UTC 16:00 は JST では翌日");
  assert.throws(() => jstDateOf("2026-08-04T00:30:00"), /explicit timezone/);
  assert.throws(() => jstDateOf("2026-08-04T00:30:00-00:00"), /known timezone offset/);
  console.log("research/pit: JST 変換 OK");
}

function testSameCloseEntryWindow() {
  assert.equal(canEnterSameClose("2026-08-04T14:59:00+09:00"), true);
  assert.equal(canEnterSameClose("2026-08-04T15:30:00+09:00"), false, "引け同時刻は当日約定できない");
  assert.equal(canEnterSameClose("2026-08-04T16:00:00+09:00"), false, "引け後の開示で当日引けは不可");
  assert.throws(() => canEnterSameClose("2026-08-04T14:59:00"), /explicit timezone/);
  console.log("research/pit: 当日引けエントリの判定 OK");
}

function testFutureTimestampRejected() {
  const analog = makeAnalog({ eventDate: "2026-09-01", observedAt: "2026-09-01T15:30:00+09:00", recordedAt: "2026-09-02" });
  assert.ok(codes(makeState({ analogs: [analog] })).includes("future_timestamp"));
  console.log("research/pit: 未来日付の検出 OK");
}

function testFutureTimestampUsesInstantOrdering() {
  const analog = makeAnalog({
    eventDate: "2026-08-03",
    observedAt: "2026-08-03T23:30:00-04:00",
    recordedAt: "2026-08-04",
  });
  assert.ok(codes(makeState({ analogs: [analog] })).includes("future_timestamp"));
  console.log("research/pit: timezone offsetを跨ぐ未来時刻の検出 OK");
}

function testSubMillisecondFutureTimestampRejected() {
  const now = new Date("2026-08-04T03:00:00.000Z");
  const analog = makeAnalog({
    id: "sub-ms-future",
    eventDate: "2026-08-04",
    observedAt: "2026-08-04T03:00:00.000000001Z",
    recordedAt: "2026-08-04",
  });
  const issues = checkPit(makeState({ analogs: [analog] }), now);
  assert.ok(
    issues.some((issue) => issue.code === "future_timestamp" && issue.target === "sub-ms-future"),
    "same-millisecond future observedAt must not collapse to the Date millisecond cutoff",
  );
  console.log("research/pit: sub-millisecond future timestamp rejected OK");
}

function testImplicitAndImpossibleInstantsRejected() {
  const implicit = makeAnalog({ id: "implicit-timezone", eventDate: "2024-01-04", observedAt: "2024-01-04T15:30:00" });
  const impossible = makeAnalog({
    id: "impossible-gregorian",
    eventDate: "2026-02-01",
    observedAt: "2026-02-31T15:30:00+09:00",
    recordedAt: "2026-03-01",
  });
  const unknownOffset = makeAnalog({
    id: "unknown-timezone-offset",
    eventDate: "2024-01-04",
    observedAt: "2024-01-04T15:30:00-00:00",
  });
  const issues = checkPit(makeState({ analogs: [implicit, impossible, unknownOffset] }), NOW);
  assert.equal(issues.filter((issue) => issue.code === "invalid_timestamp").length, 3);
  console.log("research/pit: implicit/impossible/unknown-offset instantの拒否 OK");
}

function testObservedBeforeEventRejected() {
  const analog = makeAnalog({ eventDate: "2024-01-10", observedAt: "2024-01-04T15:30:00+09:00" });
  assert.ok(codes(makeState({ analogs: [analog] })).includes("observed_before_event"));
  console.log("research/pit: 先読み観測の検出 OK");
}

function testOutcomeBeforeEventRejected() {
  const analog = makeAnalog({ outcome: { measuredAt: "2024-01-01", verdict: "repriced_up", roiBps: 100 } });
  assert.ok(codes(makeState({ analogs: [analog] })).includes("outcome_before_event"));
  console.log("research/pit: 結果日の逆転検出 OK");
}

function testHoldoutLeakDetected() {
  const analog = makeAnalog({ id: "leaky-analog", eventDate: "2024-08-01", observedAt: "2024-08-01T15:30:00+09:00", recordedAt: "2024-08-02" });
  const edge = makeEdge({ analogIds: ["leaky-analog"] });
  assert.ok(codes(makeState({ edges: [edge], analogs: [analog] })).includes("holdout_leak"));
  console.log("research/pit: Holdout 漏れ検出 OK");
}

function testOverlappingWindowsRejected() {
  const edge = makeEdge({
    holdout: {
      researchWindow: { from: "2020-01-01", to: "2024-12-31" },
      holdoutWindow: { from: "2024-07-01", to: "2025-06-30" },
    },
  });
  assert.ok(codes(makeState({ edges: [edge] })).includes("holdout_overlap"));
  console.log("research/pit: 期間重複の検出 OK");
}

function testCleanStateHasNoErrors() {
  const analog = makeAnalog({ id: "clean-analog" });
  const edge = makeEdge({ analogIds: ["clean-analog"] });
  const errors = checkPit(makeState({ edges: [edge], analogs: [analog] }), NOW).filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, []);
  console.log("research/pit: 正常系 OK");
}

testJstConversion();
testSameCloseEntryWindow();
testFutureTimestampRejected();
testFutureTimestampUsesInstantOrdering();
testSubMillisecondFutureTimestampRejected();
testImplicitAndImpossibleInstantsRejected();
testObservedBeforeEventRejected();
testOutcomeBeforeEventRejected();
testHoldoutLeakDetected();
testOverlappingWindowsRejected();
testCleanStateHasNoErrors();

console.log("research/pit: 全テスト成功");