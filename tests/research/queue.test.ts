import assert from "node:assert/strict";
import { buildQueue, DEFAULT_WEIGHTS, decayUrgency } from "../../src/research/queue.js";
import { stableStringify } from "../../src/research/schema.js";
import { makeEdge, makeState } from "./helpers.js";

const AS_OF = "2026-08-04";

function testDeterministic() {
  const state = makeState({
    edges: [
      makeEdge({ id: "edge-a" }),
      makeEdge({ id: "edge-b", hypothesis: "B の仮説。イベント Y の後、対象銘柄は超過収益を生む。" }),
    ],
  });
  const first = buildQueue(state, AS_OF);
  const second = buildQueue(state, AS_OF);
  assert.equal(stableStringify(first), stableStringify(second), "同じ入力なら常に同じ出力");
  console.log("research/queue: 決定論性 OK");
}

function testTieBreakByIdIsStable() {
  const state = makeState({
    edges: [
      makeEdge({ id: "edge-z", hypothesis: "Z の仮説。イベント Z の後、対象銘柄は超過収益を生む。" }),
      makeEdge({ id: "edge-a" }),
    ],
  });
  const queue = buildQueue(state, AS_OF);
  assert.equal(queue.entries[0].voi, queue.entries[1].voi, "前提: 同点");
  assert.equal(queue.entries[0].edgeId, "edge-a", "同点は id 昇順");
  console.log("research/queue: 同点解決 OK");
}

function testRejectedAndDeprecatedExcluded() {
  const state = makeState({
    edges: [
      makeEdge({ id: "edge-live" }),
      makeEdge({
        id: "edge-dead",
        status: "rejected",
        hypothesis: "棄却済みの仮説。イベント Q の後、対象銘柄は超過収益を生む。",
        rejection: { reason: "反証されたため棄却した（テスト用）", rejectedAt: "2024-03-01" },
      }),
    ],
  });
  const queue = buildQueue(state, AS_OF);
  assert.deepEqual(
    queue.entries.map((entry) => entry.edgeId),
    ["edge-live"],
  );
  assert.equal(queue.excluded[0].edgeId, "edge-dead");
  console.log("research/queue: 除外ルール OK");
}

function testProductionResurfacesOnlyWhenDecayDue() {
  const fresh = makeEdge({ id: "edge-prod-fresh", status: "production" });
  fresh.decay = { reviewIntervalDays: 90, lastCheckedAt: "2026-08-01" };

  const overdue = makeEdge({
    id: "edge-prod-overdue",
    status: "production",
    hypothesis: "期限切れの仮説。イベント R の後、対象銘柄は超過収益を生む。",
  });
  overdue.decay = { reviewIntervalDays: 30, lastCheckedAt: "2026-01-01" };

  const queue = buildQueue(makeState({ edges: [fresh, overdue] }), AS_OF);
  assert.deepEqual(
    queue.entries.map((entry) => entry.edgeId),
    ["edge-prod-overdue"],
    "Decay 期限が来た Production だけ Queue に戻る",
  );
  console.log("research/queue: Production の再浮上 OK");
}

function testDecayUrgencySaturates() {
  const edge = makeEdge();
  edge.decay = { reviewIntervalDays: 30, lastCheckedAt: "2026-01-01" };
  assert.equal(decayUrgency(edge, AS_OF), 1, "期限を大きく超えても 1 で頭打ち");

  const never = makeEdge();
  never.decay = { reviewIntervalDays: 30 };
  assert.equal(decayUrgency(never, AS_OF), 1, "未確認は最大の緊急度");
  console.log("research/queue: Decay 緊急度 OK");
}

function testHistoricalGapRaisesPriority() {
  const withAnalogs = makeEdge({ id: "edge-filled", analogIds: ["a1", "a2", "a3", "a4", "a5"] });
  const withoutAnalogs = makeEdge({
    id: "edge-empty",
    hypothesis: "Analog が無い仮説。イベント S の後、対象銘柄は超過収益を生む。",
    analogIds: [],
  });
  const queue = buildQueue(makeState({ edges: [withAnalogs, withoutAnalogs] }), AS_OF);
  assert.equal(queue.entries[0].edgeId, "edge-empty", "Historical が足りない方を先に研究する");
  assert.ok(queue.entries[0].drivers.length > 0, "上位理由が説明される");
  console.log("research/queue: Historical 不足の優先 OK");
}

function testWeightsAreRecorded() {
  const queue = buildQueue(makeState({ edges: [makeEdge()] }), AS_OF);
  assert.deepEqual(queue.weights, DEFAULT_WEIGHTS, "使った重みを出力に残す（監査可能性）");
  console.log("research/queue: 重みの記録 OK");
}

testDeterministic();
testTieBreakByIdIsStable();
testRejectedAndDeprecatedExcluded();
testProductionResurfacesOnlyWhenDecayDue();
testDecayUrgencySaturates();
testHistoricalGapRaisesPriority();
testWeightsAreRecorded();

console.log("research/queue: 全テスト成功");
