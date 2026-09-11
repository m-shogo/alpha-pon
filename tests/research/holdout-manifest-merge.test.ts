// study bundle が封印を狭められないことの検査。
//
// 2026-09-11 に実際に起きたこと:
//   正本の金庫（research/holdout/vault.manifest.json）は
//   2025-07-01 〜 2026-06-30 を封印していた（sealedAt 2026-08-04）。
//   ところが study bundle に**自前の manifest**（2026-03-01 〜 2026-06-19）を
//   書き足したことで、封印が8ヶ月ぶん狭まった状態で探索してしまった。
//   edge-study は bundle の manifest しか見ておらず、突き合わせが無かった。
//   **金庫の鍵を金庫の中に置いていたのと同じ。**

import assert from "node:assert/strict";
import {
  mergeHoldoutManifests,
  type HoldoutVaultManifest,
} from "../../src/research/signals/holdout-partition.js";

function manifest(
  windows: Array<{ id: string; from: string; to: string; scope?: "all_universe" | "named_codes" }>,
  sealedAt = "2026-01-01",
): HoldoutVaultManifest {
  return {
    schemaVersion: 1,
    sealedAt,
    policy: "テスト",
    windows: windows.map((one) => ({ scope: "all_universe" as const, ...one })),
  };
}

function testNarrowedWindowIsRestored() {
  const vault = manifest([{ id: "v", from: "2025-07-01", to: "2026-06-30" }], "2026-08-04");
  const bundle = manifest([{ id: "b", from: "2026-03-01", to: "2026-06-19" }], "2026-09-11");
  const merged = mergeHoldoutManifests({ bundle, vault });
  assert.deepEqual(merged.narrowed.map((one) => one.id), ["v"], "狭められた窓を報告する");
  assert.deepEqual(
    merged.manifest.windows.map((one) => one.id).sort(),
    ["b", "v"],
    "和集合を使う（どちらかで封印されていれば封印）",
  );
}

function testSealedAtKeepsTheEarlierDate() {
  // 後から上書きして「今日封印した」ことにできると、履歴が意味を失う。
  const merged = mergeHoldoutManifests({
    bundle: manifest([{ id: "b", from: "2026-03-01", to: "2026-06-19" }], "2026-09-11"),
    vault: manifest([{ id: "v", from: "2025-07-01", to: "2026-06-30" }], "2026-08-04"),
  });
  assert.equal(merged.manifest.sealedAt, "2026-08-04");
}

function testCoveringBundleIsNotReportedAsNarrowed() {
  // bundle 側が同じ id でより広く封印しているなら、狭めていない。
  const vault = manifest([{ id: "v", from: "2025-07-01", to: "2026-06-30" }]);
  const bundle = manifest([{ id: "v", from: "2025-01-01", to: "2026-12-31" }]);
  const merged = mergeHoldoutManifests({ bundle, vault });
  assert.deepEqual(merged.narrowed, []);
  assert.deepEqual(merged.manifest.windows.map((one) => one.from), ["2025-01-01"], "広いほうを残す");
}

function testSameIdButShorterIsNarrowing() {
  // id が同じでも範囲が短ければ狭めている。
  const vault = manifest([{ id: "v", from: "2025-07-01", to: "2026-06-30" }]);
  const bundle = manifest([{ id: "v", from: "2026-03-01", to: "2026-06-30" }]);
  const merged = mergeHoldoutManifests({ bundle, vault });
  assert.deepEqual(merged.narrowed.map((one) => one.id), ["v"]);
  assert.equal(merged.manifest.windows[0]!.from, "2025-07-01", "正本の範囲へ戻す");
}

function testScopeChangeIsNarrowing() {
  // all_universe を named_codes にすり替えるのも封印を緩める行為。
  const vault = manifest([{ id: "v", from: "2025-07-01", to: "2026-06-30" }]);
  const bundle: HoldoutVaultManifest = manifest([
    { id: "v", from: "2025-07-01", to: "2026-06-30", scope: "named_codes" },
  ]);
  const merged = mergeHoldoutManifests({ bundle, vault });
  assert.deepEqual(merged.narrowed.map((one) => one.id), ["v"]);
  assert.equal(merged.manifest.windows[0]!.scope, "all_universe");
}

function testNoVaultKeepsTheBundleAsIs() {
  // 金庫を置いていない環境もある。そこで落とすと誰も走らせなくなる。
  const bundle = manifest([{ id: "b", from: "2026-03-01", to: "2026-06-19" }]);
  const merged = mergeHoldoutManifests({ bundle, vault: null });
  assert.deepEqual(merged.narrowed, []);
  assert.equal(merged.manifest, bundle);
}

testNarrowedWindowIsRestored();
testSealedAtKeepsTheEarlierDate();
testCoveringBundleIsNotReportedAsNarrowed();
testSameIdButShorterIsNarrowing();
testScopeChangeIsNarrowing();
testNoVaultKeepsTheBundleAsIs();

console.log("holdout-manifest-merge: 全テスト成功");
