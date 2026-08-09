import assert from "node:assert/strict";
import {
  checkProductionIntegrity,
  evaluateGate,
  isInHoldout,
  type HoldoutAccessEntry,
  type HoldoutManifest,
} from "../../src/research/promotion.js";
import { GATE_KEYS, type Edge } from "../../src/research/types.js";
import { makeEdge, makeState } from "./helpers.js";

const AS_OF = "2024-02-01";

function passAllGates(edge: Edge): Edge {
  for (const key of GATE_KEYS) {
    edge.promotionGate[key] = { state: "pass", evidence: `テスト根拠(${key})`, checkedAt: AS_OF };
  }
  return edge;
}

const ACCESS: HoldoutAccessEntry = {
  schemaVersion: 1,
  id: "access-1",
  edgeId: "fixture-complete-edge",
  windowId: "vault-2025h2-2026h1",
  openedAt: "2024-02-01T10:00:00+09:00",
  actor: "test",
  purpose: "production_gate",
  result: "pass",
};

function testUnknownGateBlocksPromotion() {
  const evaluation = evaluateGate(makeEdge(), makeState(), [], AS_OF);
  assert.equal(evaluation.promotable, false);
  assert.ok(evaluation.blockers.length > 0, "未確認の Gate は昇格を止める");
  console.log("research/promotion: 未確認 Gate の遮断 OK");
}

function testSampleShortfallIsCaught() {
  const edge = passAllGates(makeEdge()); // samples: 4/20
  const evaluation = evaluateGate(edge, makeState({ edges: [edge] }), [ACCESS], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "sufficientSamples"),
    "pass と書いてもサンプルが足りなければ通さない",
  );
  console.log("research/promotion: サンプル数の裏取り OK");
}

function testHoldoutPassRequiresAccessRecord() {
  const edge = passAllGates(makeEdge());
  edge.samples.current = 20;
  const evaluation = evaluateGate(edge, makeState({ edges: [edge] }), [], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
    "開封記録の無い Holdout PASS は認めない",
  );
  console.log("research/promotion: Holdout 開封記録の必須化 OK");
}

function testHoldoutPassRequiresPastStrictAccessRecord() {
  const edge = passAllGates(makeEdge());
  edge.samples.current = 20;
  const state = makeState({ edges: [edge] });

  const valid = evaluateGate(edge, state, [ACCESS], AS_OF);
  assert.equal(
    valid.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
    false,
    "asOf 時点で利用可能な strict-timestamp PASS は裏取りに使える",
  );

  const futureAccess: HoldoutAccessEntry = {
    ...ACCESS,
    id: "access-future",
    openedAt: "2024-02-02T00:00:00+09:00",
  };
  const future = evaluateGate(edge, state, [futureAccess], AS_OF);
  assert.ok(
    future.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
    "未来に開封した Holdout 結果で現在の Gate を通してはいけない",
  );

  const implicitTimestamp: HoldoutAccessEntry = {
    ...ACCESS,
    id: "access-implicit-timezone",
    openedAt: "2024-02-01T10:00:00",
  };
  const invalid = evaluateGate(edge, state, [implicitTimestamp], AS_OF);
  assert.ok(
    invalid.unsupportedPasses.some(
      (item) => item.gate === "holdoutPass" && item.reason.includes("不正な openedAt"),
    ),
    "timezoneなし openedAt は Holdout PASS 根拠に使わない",
  );
  console.log("research/promotion: Holdout access temporal provenance OK");
}

function testCounterfactualRequired() {
  const edge = passAllGates(makeEdge());
  edge.samples.current = 20;
  const evaluation = evaluateGate(edge, makeState({ edges: [edge] }), [ACCESS], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "counterfactualExplained"),
    "Counterfactual が 1 件も無ければ説明可能とは言えない",
  );
  console.log("research/promotion: Counterfactual の必須化 OK");
}

function testUnresolvedConfounderBlocks() {
  const edge = passAllGates(makeEdge({ analogIds: ["analog-x"] }));
  edge.samples.current = 20;
  const state = makeState({
    edges: [edge],
    confounders: [
      {
        schemaVersion: 1,
        id: "confounder-1",
        analogId: "analog-x",
        category: "earnings",
        date: "2024-01-10",
        description: "同日に決算発表があった",
        handling: "acknowledged_unresolved",
        recordedAt: "2024-01-11",
      },
    ],
  });
  const evaluation = evaluateGate(edge, state, [ACCESS], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "confoundersRemoved"),
    "未処理の交絡が残っていたら除去済みとは言えない",
  );
  console.log("research/promotion: 未処理 Confounder の遮断 OK");
}

function testDecayCheckedRequiresValidPastDate() {
  const edge = passAllGates(makeEdge());
  edge.samples.current = 20;
  const state = makeState({ edges: [edge] });

  edge.decay.lastCheckedAt = "2024-02-31";
  const invalid = evaluateGate(edge, state, [ACCESS], AS_OF);
  assert.ok(
    invalid.unsupportedPasses.some(
      (item) => item.gate === "decayChecked" && item.reason.includes("実在する YYYY-MM-DD"),
    ),
    "非実在 Decay 日付は自己申告PASSを裏取りできない",
  );

  edge.decay.lastCheckedAt = "2024-02-02";
  const future = evaluateGate(edge, state, [ACCESS], AS_OF);
  assert.ok(
    future.unsupportedPasses.some(
      (item) => item.gate === "decayChecked" && item.reason.includes("未来"),
    ),
    "未来の Decay 確認で現在の Gate を通してはいけない",
  );

  edge.decay.lastCheckedAt = "2024-01-31";
  const valid = evaluateGate(edge, state, [ACCESS], AS_OF);
  assert.equal(
    valid.unsupportedPasses.some((item) => item.gate === "decayChecked"),
    false,
    "asOf以前のfreshなDecay確認は従来どおり裏取りできる",
  );
  console.log("research/promotion: decayChecked temporal provenance OK");
}

function testInvalidAsOfFailsClosed() {
  assert.throws(
    () => evaluateGate(makeEdge(), makeState(), [], "2024-02-31"),
    /promotion asOf must be a real YYYY-MM-DD date/,
  );
  assert.throws(
    () => checkProductionIntegrity(makeState({ edges: [makeEdge({ status: "production" })] }), [], "2024-13-01"),
    /promotion asOf must be a real YYYY-MM-DD date/,
  );
  console.log("research/promotion: invalid Production Gate snapshot date fails closed OK");
}

function testProductionWithoutGateIsIntegrityError() {
  const edge = makeEdge({ status: "production" });
  const issues = checkProductionIntegrity(makeState({ edges: [edge] }), [], AS_OF);
  assert.ok(
    issues.some((issue) => issue.code === "unverified_production"),
    "Gate を通さない production は CI エラー",
  );
  console.log("research/promotion: 未検証 Production の禁止 OK");
}

function holdoutManifest(overrides: Partial<HoldoutManifest> = {}): HoldoutManifest {
  return {
    schemaVersion: 1,
    sealedAt: "2026-08-04",
    policy: "テスト用の封印ポリシー",
    windows: [
      { id: "w1", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" },
      { id: "w2", from: "2024-01-01", to: "2024-12-31", scope: "named_codes", codes: ["8136"] },
    ],
    ...overrides,
  };
}

function testHoldoutWindowMembership() {
  const manifest = holdoutManifest();
  assert.equal(isInHoldout(manifest, "9999", "2026-01-01"), true, "全銘柄封印の期間内");
  assert.equal(isInHoldout(manifest, "9999", "2024-06-01"), false, "named_codes に含まれない銘柄は対象外");
  assert.equal(isInHoldout(manifest, "8136", "2024-06-01"), true);
  assert.equal(isInHoldout(manifest, "8136", "2027-01-01"), false);
  console.log("research/promotion: Holdout 範囲判定 OK");
}

function testHoldoutWindowDatesFailClosed() {
  assert.throws(
    () => isInHoldout(holdoutManifest(), "8136", "2026-02-31"),
    /holdout lookup date must be a real YYYY-MM-DD date/,
  );
  assert.throws(
    () => isInHoldout(holdoutManifest({ sealedAt: "2026-02-31" }), "8136", "2024-06-01"),
    /holdout manifest sealedAt must be a real YYYY-MM-DD date/,
  );
  assert.throws(
    () => isInHoldout(holdoutManifest({
      windows: [{ id: "bad-from", from: "2026-02-31", to: "2026-03-31", scope: "all_universe" }],
    }), "8136", "2026-03-01"),
    /holdout window bad-from\.from must be a real YYYY-MM-DD date/,
  );
  assert.throws(
    () => isInHoldout(holdoutManifest({
      windows: [{ id: "bad-to", from: "2026-03-01", to: "2026-13-01", scope: "all_universe" }],
    }), "8136", "2026-03-01"),
    /holdout window bad-to\.to must be a real YYYY-MM-DD date/,
  );
  assert.throws(
    () => isInHoldout(holdoutManifest({
      windows: [{ id: "reversed", from: "2026-04-01", to: "2026-03-01", scope: "all_universe" }],
    }), "8136", "2026-03-15"),
    /holdout window reversed must have from <= to/,
  );
  console.log("research/promotion: malformed Holdout membership boundaries fail closed OK");
}

testUnknownGateBlocksPromotion();
testSampleShortfallIsCaught();
testHoldoutPassRequiresAccessRecord();
testHoldoutPassRequiresPastStrictAccessRecord();
testCounterfactualRequired();
testUnresolvedConfounderBlocks();
testDecayCheckedRequiresValidPastDate();
testInvalidAsOfFailsClosed();
testProductionWithoutGateIsIntegrityError();
testHoldoutWindowMembership();
testHoldoutWindowDatesFailClosed();

console.log("research/promotion: 全テスト成功");
