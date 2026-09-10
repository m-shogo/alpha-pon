// 探索期間 / 確認期間の事前登録と分割のテスト。
//
// 守りたい性質:
//   1. 探索と確認を重ねられない（閾値を決めた期間で確認しても意味がない）
//   2. confirm は explore より後（未来で決めた閾値を過去で確認しない）
//   3. Holdout と重なる計画を作れない
//   4. **確認期間は1計画につき1回まで**（確認集合の上で選ばない）

import assert from "node:assert/strict";
import {
  assertPlanAvoidsHoldout,
  buildStudyPeriodPlan,
  checkConfirmatoryUsage,
  computeStudyPeriodPlanId,
  partitionByStudyPeriod,
  type ConfirmatoryRunRecord,
  type StudyPeriodPlanInput,
  type StudyPeriodSample,
} from "../../src/research/signals/study-period-plan.js";
import type { HoldoutVaultManifest } from "../../src/research/signals/holdout-partition.js";

const NOW = new Date("2026-09-11T09:00:00+09:00");

const MANIFEST: HoldoutVaultManifest = {
  schemaVersion: 1,
  sealedAt: "2026-08-04",
  policy: "Production Gate 判定のとき以外は一切参照しない",
  windows: [{ id: "vault", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" }],
};

function planInput(over: Partial<StudyPeriodPlanInput> = {}): StudyPeriodPlanInput {
  return {
    edgeId: "misconduct-overreaction-recovery",
    explore: { from: "2024-01-01", to: "2024-12-31" },
    confirm: { from: "2025-01-01", to: "2025-06-30" },
    holdoutWindowIds: ["vault"],
    rationale: "2024年で閾値を決め、2025年前半で確認する",
    ...over,
  };
}

function testExploreAndConfirmCannotOverlap() {
  assert.throws(
    () => buildStudyPeriodPlan(planInput({ confirm: { from: "2024-06-01", to: "2025-06-30" } }), NOW),
    /重ねられません/,
    "閾値を決めた期間で確認しても意味がない",
  );
}

function testConfirmMustFollowExplore() {
  assert.throws(
    () => buildStudyPeriodPlan(planInput({
      explore: { from: "2025-01-01", to: "2025-12-31" },
      confirm: { from: "2024-01-01", to: "2024-06-30" },
    }), NOW),
    /confirm は explore より後/,
    "未来で決めた閾値を過去で確認しない",
  );
}

function testRationaleIsRequired() {
  assert.throws(
    () => buildStudyPeriodPlan(planInput({ rationale: "  " }), NOW),
    /rationale must be a non-empty string/,
  );
}

function testPlanIdIsContentAddressed() {
  const a = computeStudyPeriodPlanId(planInput());
  const b = computeStudyPeriodPlanId(planInput({ rationale: "別の説明" }));
  assert.equal(a, b, "説明文だけでは別計画にならない");
  const c = computeStudyPeriodPlanId(planInput({ confirm: { from: "2025-01-01", to: "2025-12-31" } }));
  assert.notEqual(a, c, "期間をずらせば別計画");
}

function testHoldoutOverlapIsRejected() {
  const plan = buildStudyPeriodPlan(planInput({
    explore: { from: "2024-01-01", to: "2024-12-31" },
    confirm: { from: "2025-08-01", to: "2025-12-31" },   // Holdout 内
  }), NOW);
  assert.throws(
    () => assertPlanAvoidsHoldout(plan, MANIFEST),
    /Holdout vault.*と重なっています/,
    "封印期間で確認してはいけない",
  );
  const safe = buildStudyPeriodPlan(planInput(), NOW);
  assertPlanAvoidsHoldout(safe, MANIFEST);
}

function samples(): StudyPeriodSample[] {
  return [
    { id: "s-explore", code: "8136", date: "2024-06-01" },
    { id: "s-confirm", code: "8136", date: "2025-03-01" },
    { id: "s-holdout", code: "8136", date: "2025-09-01" },
    { id: "s-before", code: "8136", date: "2023-06-01" },
    { id: "s-after", code: "8136", date: "2026-08-01" },
  ];
}

function testPartitionSeparatesAllFourPhases() {
  const plan = buildStudyPeriodPlan(planInput(), NOW);
  const result = partitionByStudyPeriod(samples(), plan, MANIFEST);
  assert.deepEqual(result.explore.map((one) => one.id), ["s-explore"]);
  assert.deepEqual(result.confirm.map((one) => one.id), ["s-confirm"]);
  assert.deepEqual(result.holdout.map((one) => one.id), ["s-holdout"]);
  assert.deepEqual(result.outside.map((one) => one.id).sort(), ["s-after", "s-before"]);
  assert.deepEqual(result.countByPhase, { explore: 1, confirm: 1, holdout: 1, outside: 2 });
}

function testOutsideSamplesAreCountedNotDropped() {
  const plan = buildStudyPeriodPlan(planInput(), NOW);
  const result = partitionByStudyPeriod(samples(), plan, MANIFEST);
  assert.ok(
    result.warnings.some((one) => one.includes("どの期間にも属さないサンプルが 2 件")),
    "黙って落とすと標本数が実態と食い違う",
  );
}

function testHoldoutTakesPrecedenceOverPeriods() {
  // 封印期間と探索期間が万一重なっても、封印側を優先する。
  const plan = buildStudyPeriodPlan(planInput({
    explore: { from: "2024-01-01", to: "2026-05-31" },
    confirm: { from: "2026-07-01", to: "2026-08-31" },
  }), NOW);
  const result = partitionByStudyPeriod(
    [{ id: "s", code: "8136", date: "2025-09-01" }],
    plan,
    MANIFEST,
  );
  assert.equal(result.countByPhase.holdout, 1);
  assert.equal(result.countByPhase.explore, 0);
}

function testEmptyPhaseIsWarned() {
  const plan = buildStudyPeriodPlan(planInput(), NOW);
  const result = partitionByStudyPeriod([{ id: "s", code: "8136", date: "2023-01-01" }], plan, MANIFEST);
  assert.ok(result.warnings.some((one) => one.includes("探索期間のサンプルが0件")));
  assert.ok(result.warnings.some((one) => one.includes("確認期間のサンプルが0件")));
}

function testConfirmatorySetCanOnlyBeUsedOnce() {
  const plan = buildStudyPeriodPlan(planInput(), NOW);
  const first = checkConfirmatoryUsage(plan, [], "params-a");
  assert.equal(first.allowed, true);
  assert.equal(first.priorRunCount, 0);

  const priorRuns: ConfirmatoryRunRecord[] = [
    { planId: plan.planId, edgeId: plan.edgeId, runAt: NOW.toISOString(), paramsHash: "params-a" },
  ];

  const rerun = checkConfirmatoryUsage(plan, priorRuns, "params-a");
  assert.equal(rerun.allowed, true, "同一設定の再実行は再現性の確認なので許す");

  const different = checkConfirmatoryUsage(plan, priorRuns, "params-b");
  assert.equal(different.allowed, false, "設定を変えて2回目は確認集合の上での選択になる");
  assert.ok(different.reason.includes("期間を切り直して別計画"));
}

function testOtherPlansDoNotBlockEachOther() {
  const plan = buildStudyPeriodPlan(planInput(), NOW);
  const otherPlanRuns: ConfirmatoryRunRecord[] = [
    { planId: "other-plan", edgeId: plan.edgeId, runAt: NOW.toISOString(), paramsHash: "x" },
  ];
  assert.equal(checkConfirmatoryUsage(plan, otherPlanRuns, "params-a").allowed, true);
}

function testMalformedInputFailsClosed() {
  for (const [over, pattern] of [
    [{ edgeId: "" }, /edgeId must be a non-empty string/],
    [{ explore: { from: "2024/01/01", to: "2024-12-31" } }, /must be YYYY-MM-DD/],
    [{ explore: { from: "2024-12-31", to: "2024-01-01" } }, /from must be on or before to/],
  ] as const) {
    assert.throws(() => buildStudyPeriodPlan(planInput(over as Partial<StudyPeriodPlanInput>), NOW), pattern);
  }
  const plan = buildStudyPeriodPlan(planInput(), NOW);
  assert.throws(
    () => partitionByStudyPeriod([{ id: "s", code: "8136", date: "2024/06/01" }], plan, MANIFEST),
    /must be YYYY-MM-DD/,
  );
}

testExploreAndConfirmCannotOverlap();
testConfirmMustFollowExplore();
testRationaleIsRequired();
testPlanIdIsContentAddressed();
testHoldoutOverlapIsRejected();
testPartitionSeparatesAllFourPhases();
testOutsideSamplesAreCountedNotDropped();
testHoldoutTakesPrecedenceOverPeriods();
testEmptyPhaseIsWarned();
testConfirmatorySetCanOnlyBeUsedOnce();
testOtherPlansDoNotBlockEachOther();
testMalformedInputFailsClosed();

console.log("research/study-period-plan: 全テスト成功");
