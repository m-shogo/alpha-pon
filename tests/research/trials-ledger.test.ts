// 試行回数台帳のテスト。
//
// 守りたい性質:
//   1. 結果を見る前に登録される（都合の悪い試行を消せない）
//   2. パラメータを変えたら別試行として数えられる
//   3. 同一条件の再実行は試行を増やさない（再現性の確認を罰しない）
//   4. 未登録の試行に結果を書けない
//   5. 同一試行に異なる結果を書けない（決定論の破れを検出する）

import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeDatasetFingerprint,
  computeTrialId,
  countTrials,
  readTrialLedger,
  recordTrialOutcome,
  registerTrial,
  type TrialRegistrationInput,
} from "../../src/research/trials-ledger.js";

const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-trials-"));
const NOW = new Date("2026-09-10T12:00:00+09:00");

function ledgerPath(name: string): string {
  return join(dir, `${name}.jsonl`);
}

function trial(over: Partial<TrialRegistrationInput> = {}): TrialRegistrationInput {
  return {
    edgeId: "earnings-gap-overreaction",
    specId: "earnings-gap-v1",
    params: { gapThresholdPct: -7, holdingPeriodDays: 20 },
    datasetFingerprint: "dataset-a",
    intent: "閾値 -7% での初回検証",
    ...over,
  };
}

const OUTCOME = {
  executedCount: 130,
  meanNetAlphaBps: 42.5,
  tStat: 2.1,
  clusteredTStat: 1.4,
  clusterCount: 48,
};

try {
  function testTrialIdIsDeterministicAndOrderInsensitive() {
    const a = computeTrialId(trial({ params: { gapThresholdPct: -7, holdingPeriodDays: 20 } }));
    const b = computeTrialId(trial({ params: { holdingPeriodDays: 20, gapThresholdPct: -7 } }));
    assert.equal(a, b, "パラメータの記述順で別試行にしない");
    const c = computeTrialId(trial({ params: { gapThresholdPct: -8, holdingPeriodDays: 20 } }));
    assert.notEqual(a, c, "閾値を変えたら別試行");
  }

  function testDifferentDatasetIsADifferentTrial() {
    const a = computeTrialId(trial({ datasetFingerprint: "dataset-a" }));
    const b = computeTrialId(trial({ datasetFingerprint: "dataset-b" }));
    assert.notEqual(a, b, "同じパラメータでも対象データが違えば別試行");
  }

  function testDatasetFingerprintIsOrderInsensitive() {
    const a = computeDatasetFingerprint({
      signalIds: ["s2", "s1"], priceCodes: ["2222", "1111"], asOf: "2026-06-01T00:00:00+09:00",
    });
    const b = computeDatasetFingerprint({
      signalIds: ["s1", "s2"], priceCodes: ["1111", "2222"], asOf: "2026-06-01T00:00:00+09:00",
    });
    assert.equal(a, b, "並び順で指紋が変わってはいけない");
    const c = computeDatasetFingerprint({
      signalIds: ["s1", "s2"], priceCodes: ["1111", "2222"], asOf: "2026-07-01T00:00:00+09:00",
    });
    assert.notEqual(a, c, "asOf が違えば別データ");
  }

  function testThresholdSweepIncrementsTrialCount() {
    const path = ledgerPath("sweep");
    const counts: number[] = [];
    for (const threshold of [-5, -6, -7, -8, -9]) {
      const result = registerTrial(
        trial({ params: { gapThresholdPct: threshold, holdingPeriodDays: 20 }, intent: `閾値 ${threshold}% の探索` }),
        path,
        NOW,
      );
      counts.push(result.trialCount);
    }
    assert.deepEqual(counts, [1, 2, 3, 4, 5], "閾値を5通り試したら試行回数は5になる");
  }

  function testReRunningTheSameTrialDoesNotInflateCount() {
    const path = ledgerPath("rerun");
    const first = registerTrial(trial(), path, NOW);
    const second = registerTrial(trial(), path, NOW);
    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false, "同一条件の再実行は新規試行にしない");
    assert.equal(second.trialCount, 1, "再現性の確認で試行回数が増えてはいけない");
    assert.equal(readTrialLedger(path).length, 1, "行も増えない");
  }

  function testRegistrationCountsEvenWithoutOutcome() {
    // 結果が悪くて記録しなかった試行も回数に数える。これが台帳の要点。
    const path = ledgerPath("no-outcome");
    registerTrial(trial({ params: { gapThresholdPct: -5 }, intent: "捨てた試行" }), path, NOW);
    registerTrial(trial({ params: { gapThresholdPct: -6 }, intent: "捨てた試行" }), path, NOW);
    const good = registerTrial(trial({ params: { gapThresholdPct: -7 }, intent: "採用した試行" }), path, NOW);
    recordTrialOutcome(good.trialId, OUTCOME, path, NOW);
    assert.equal(
      countTrials(readTrialLedger(path), "earnings-gap-overreaction"),
      3,
      "結果を書いたのは1件でも、試行回数は3件",
    );
  }

  function testTrialsAreCountedPerEdge() {
    const path = ledgerPath("per-edge");
    registerTrial(trial({ edgeId: "edge-a", params: { x: 1 } }), path, NOW);
    registerTrial(trial({ edgeId: "edge-a", params: { x: 2 } }), path, NOW);
    registerTrial(trial({ edgeId: "edge-b", params: { x: 1 } }), path, NOW);
    const records = readTrialLedger(path);
    assert.equal(countTrials(records, "edge-a"), 2);
    assert.equal(countTrials(records, "edge-b"), 1);
    assert.equal(countTrials(records, "edge-unknown"), 0);
  }

  function testOutcomeForUnregisteredTrialIsRejected() {
    const path = ledgerPath("unregistered");
    assert.throws(
      () => recordTrialOutcome("0".repeat(32), OUTCOME, path, NOW),
      /cannot record an outcome for an unregistered trial/,
      "結果だけ後から生やせてはいけない",
    );
  }

  function testConflictingOutcomeIsRejected() {
    const path = ledgerPath("conflict");
    const registered = registerTrial(trial(), path, NOW);
    recordTrialOutcome(registered.trialId, OUTCOME, path, NOW);
    const again = recordTrialOutcome(registered.trialId, OUTCOME, path, NOW);
    assert.equal(again.appended, false, "同一結果の再記録は行を増やさない");
    assert.throws(
      () => recordTrialOutcome(registered.trialId, { ...OUTCOME, meanNetAlphaBps: 99 }, path, NOW),
      /not deterministic/,
      "同じ試行で違う結果が出るのはパイプラインが非決定論的ということ",
    );
  }

  function testLedgerIsAppendOnly() {
    const path = ledgerPath("append-only");
    const a = registerTrial(trial({ params: { x: 1 } }), path, NOW);
    const before = readFileSync(path, "utf-8");
    registerTrial(trial({ params: { x: 2 } }), path, NOW);
    recordTrialOutcome(a.trialId, OUTCOME, path, NOW);
    const after = readFileSync(path, "utf-8");
    assert.ok(after.startsWith(before), "既存行を書き換えず末尾に追記するだけ");
    assert.equal(readTrialLedger(path).length, 3);
  }

  function testEmptyIntentIsRejected() {
    const path = ledgerPath("intent");
    for (const intent of ["", "   "]) {
      assert.throws(
        () => registerTrial(trial({ intent }), path, NOW),
        /intent must be a non-empty string/,
        "何を確かめる試行なのかを書かせる",
      );
    }
  }

  function testDuplicateRegistrationRowsDoNotInflateCount() {
    // registerTrial は read → check → append なので、別プロセスが同時に
    // 同じ試行を登録すると重複行が出る（実測: 6並行で4行）。
    // append-only なので行は消せないが、試行回数は trialId の集合で数えるため
    // 影響しない。False Discovery Guard へ渡す値が水増しされないことを固定する。
    const path = ledgerPath("dup-rows");
    const input = trial({ params: { same: 1 } });
    registerTrial(input, path, NOW);
    const duplicated = {
      schemaVersion: 1,
      kind: "registration",
      trialId: computeTrialId(input),
      recordedAt: NOW.toISOString(),
      ...input,
    };
    appendFileSync(path, `${JSON.stringify(duplicated)}\n${JSON.stringify(duplicated)}\n`);
    const records = readTrialLedger(path);
    assert.equal(records.length, 3, "重複行はそのまま残る");
    assert.equal(countTrials(records, input.edgeId), 1, "試行回数は水増しされない");
  }

  function testMalformedLedgerFailsClosed() {
    const path = ledgerPath("malformed");
    registerTrial(trial(), path, NOW);
    appendFileSync(path, '{"schemaVersion":2,"kind":"registration","recordedAt":"2026-09-10T12:00:00+09:00"}\n');
    assert.throws(() => readTrialLedger(path), /schemaVersion must be 1/);
  }

  testTrialIdIsDeterministicAndOrderInsensitive();
  testDifferentDatasetIsADifferentTrial();
  testDatasetFingerprintIsOrderInsensitive();
  testThresholdSweepIncrementsTrialCount();
  testReRunningTheSameTrialDoesNotInflateCount();
  testRegistrationCountsEvenWithoutOutcome();
  testTrialsAreCountedPerEdge();
  testOutcomeForUnregisteredTrialIsRejected();
  testConflictingOutcomeIsRejected();
  testLedgerIsAppendOnly();
  testDuplicateRegistrationRowsDoNotInflateCount();
  testEmptyIntentIsRejected();
  testMalformedLedgerFailsClosed();

  console.log("research/trials-ledger: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
