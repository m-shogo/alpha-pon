// 封印を「価格を読む入口」で守るテスト。
//
// なぜ要るか（2026-09-11 に起きたこと）:
//   封印を切るのは各 CLI の仕事だったので、書き忘れた CLI だけが封印の中を読めた。
//   入口（loadStudyInputsFromStore）で止めれば、経路が増えても守りは1か所で効く。
//
// 守りたい性質:
//   1. 研究の期間より後（封印の中）を指したら止める
//   2. 研究の期間より前（過去側の封印）を指したら止める
//   3. allowSealed を明示したときだけ通す（research:holdout:open だけが使う）
//   4. 指定が無ければ研究の期間に収める

import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadStudyInputsFromStore,
  researchRangeFromVault,
  StudyInputsError,
} from "../../src/research/study-inputs-from-store.js";
import type { HoldoutVaultManifest } from "../../src/research/signals/holdout-partition.js";

const window = (id: string, from: string, to: string) => ({ id, from, to, scope: "all_universe" as const });

/** 過去側にも封印がある形（J-Quants Light で5年分を入れたときの想定）。 */
const BOTH_SIDES: HoldoutVaultManifest = {
  schemaVersion: 1,
  sealedAt: "2026-08-04",
  policy: "テスト用",
  windows: [
    window("past", "2019-01-01", "2024-06-18"),
    window("future", "2025-07-01", "2026-06-30"),
  ],
};

function testResearchRangeFromTheRealManifest() {
  const range = researchRangeFromVault();
  assert.ok(range, "実 manifest から研究期間が決まる");
  assert.equal(range!.to, "2025-06-30");
  assert.equal(range!.from, null, "いまは過去側に封印が無いので始まりは無制限");
}

function testSealedToIsRejected() {
  assert.throws(
    () => loadStudyInputsFromStore({ to: "2026-01-31" }),
    (error: unknown) => error instanceof StudyInputsError && /to=2026-01-31 は封印期間/.test((error as Error).message),
    "封印の中を指したら止める（実 manifest）",
  );
}

function testSealedFromIsRejected() {
  assert.throws(
    () => loadStudyInputsFromStore({ from: "2024-01-01", to: "2025-06-30", vaultManifest: BOTH_SIDES }),
    (error: unknown) => error instanceof StudyInputsError && /from=2024-01-01 は封印期間/.test((error as Error).message),
    "過去側の封印を指したら止める",
  );
  assert.throws(
    () => loadStudyInputsFromStore({ to: "2026-01-31", vaultManifest: BOTH_SIDES }),
    /to=2026-01-31 は封印期間/,
  );
}

function testAllowSealedSkipsTheCheck() {
  // 封印の検査を通り越すと、次は価格ストアの検査で落ちる（権利落ち台帳が無い）。
  // 「封印で止まった」のか「その先まで進んだ」のかを、メッセージで区別する。
  const empty = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-seal-"));
  try {
    assert.throws(
      () => loadStudyInputsFromStore({ to: "2026-12-31", root: empty }),
      /封印期間/,
      "allowSealed 無しなら封印で止まる",
    );
    assert.throws(
      () => loadStudyInputsFromStore({ to: "2026-12-31", root: empty, allowSealed: true }),
      /権利落ち台帳がありません/,
      "allowSealed ならその先まで進む",
    );
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}

function testMissingManifestMeansNoLimit() {
  const empty = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-seal-"));
  try {
    assert.throws(
      () => loadStudyInputsFromStore({ to: "2026-12-31", root: empty, vaultManifest: null }),
      /権利落ち台帳がありません/,
      "封印の定義が無ければ期間の制限もしない",
    );
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}

testResearchRangeFromTheRealManifest();
testSealedToIsRejected();
testSealedFromIsRejected();
testAllowSealedSkipsTheCheck();
testMissingManifestMeansNoLimit();

console.log("research/study-inputs-seal: 全テスト成功");
