// Holdout Vault によるサンプル分割のテスト。
//
// 守りたい性質:
//   1. 既定で封印期間のサンプルを使わない
//   2. 除外件数を必ず見せる（黙って n が減らない）
//   3. access_log の記録なしに開封できない
//   4. named_codes スコープが効く

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  partitionByHoldout,
  type HoldoutAccessRecord,
  type HoldoutSample,
  type HoldoutVaultManifest,
} from "../../src/research/signals/holdout-partition.js";

// 実際の research/holdout/vault.manifest.json と同じ形。
const MANIFEST: HoldoutVaultManifest = {
  schemaVersion: 1,
  sealedAt: "2026-08-04",
  policy: "Production Gate 判定のとき以外は一切参照しない",
  windows: [
    { id: "vault-2025h2-2026h1", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" },
  ],
};

const ACCESS: HoldoutAccessRecord = {
  id: "holdout-access-001",
  edgeId: "misconduct-overreaction-recovery",
  windowId: "vault-2025h2-2026h1",
  openedAt: "2026-09-10T12:00:00+09:00",
  actor: "human",
  purpose: "Production Gate 判定",
  result: "opened",
};

function samples(): HoldoutSample[] {
  return [
    { id: "s-before", code: "8136", date: "2025-06-30" },
    { id: "s-in-1", code: "8136", date: "2025-07-01" },
    { id: "s-in-2", code: "7974", date: "2026-01-15" },
    { id: "s-in-3", code: "4661", date: "2026-06-30" },
    { id: "s-after", code: "8136", date: "2026-07-01" },
  ];
}

function testSealedSamplesAreExcludedByDefault() {
  const result = partitionByHoldout({ samples: samples(), manifest: MANIFEST });
  assert.deepEqual(result.research.map((one) => one.id), ["s-before", "s-after"]);
  assert.equal(result.opened.length, 0);
  assert.equal(result.excluded.length, 3, "封印期間の3件は既定で使わない");
  assert.equal(result.hitCountByWindowId["vault-2025h2-2026h1"], 3);
}

function testExclusionIsAlwaysVisible() {
  const result = partitionByHoldout({ samples: samples(), manifest: MANIFEST });
  assert.ok(
    result.warnings.some((one) => one.includes("3 件を除外") && one.includes("research 2 件")),
    "黙って n が減らないよう、除外件数と残り件数を出す",
  );
}

function testBoundaryDatesAreInclusive() {
  const result = partitionByHoldout({
    samples: [
      { id: "edge-from", code: "8136", date: "2025-07-01" },
      { id: "edge-to", code: "8136", date: "2026-06-30" },
      { id: "just-before", code: "8136", date: "2025-06-30" },
      { id: "just-after", code: "8136", date: "2026-07-01" },
    ],
    manifest: MANIFEST,
  });
  assert.deepEqual(result.excluded.map((one) => one.sample.id), ["edge-from", "edge-to"]);
  assert.deepEqual(result.research.map((one) => one.id), ["just-before", "just-after"]);
}

function testOpeningRequiresAnAccessRecord() {
  assert.throws(
    () => partitionByHoldout({
      samples: samples(),
      manifest: MANIFEST,
      requestedWindowIds: ["vault-2025h2-2026h1"],
    }),
    /cannot be opened without an access_log record/,
    "「開けたことにする」を作らない",
  );

  assert.throws(
    () => partitionByHoldout({
      samples: samples(),
      manifest: MANIFEST,
      requestedWindowIds: ["vault-2025h2-2026h1"],
      accessLog: [{ ...ACCESS, edgeId: "other-edge" }],
      edgeId: "misconduct-overreaction-recovery",
    }),
    /for edge misconduct-overreaction-recovery/,
    "別 Edge の開封記録を流用させない",
  );
}

function testOpeningWithRecordWorksAndWarns() {
  const result = partitionByHoldout({
    samples: samples(),
    manifest: MANIFEST,
    requestedWindowIds: ["vault-2025h2-2026h1"],
    accessLog: [ACCESS],
    edgeId: "misconduct-overreaction-recovery",
  });
  assert.equal(result.opened.length, 3);
  assert.equal(result.excluded.length, 0);
  assert.ok(
    result.warnings.some((one) => one.includes("やり直せません")),
    "開封したことを必ず警告する",
  );
}

function testUnknownWindowIsRejected() {
  assert.throws(
    () => partitionByHoldout({
      samples: samples(),
      manifest: MANIFEST,
      requestedWindowIds: ["no-such-window"],
      accessLog: [ACCESS],
    }),
    /unknown holdout window id/,
  );
}

function testNamedCodesScope() {
  const manifest: HoldoutVaultManifest = {
    ...MANIFEST,
    windows: [{
      id: "vault-named", from: "2025-07-01", to: "2026-06-30",
      scope: "named_codes", codes: ["8136"],
    }],
  };
  const result = partitionByHoldout({ samples: samples(), manifest });
  assert.deepEqual(
    result.excluded.map((one) => one.sample.id),
    ["s-in-1"],
    "対象コードのサンプルだけ封印される",
  );
  assert.equal(result.research.length, 4);
}

function testMalformedManifestFailsClosed() {
  for (const [windows, pattern] of [
    [[], /at least one window/],
    [[{ id: "", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" as const }], /non-empty string/],
    [[{ id: "a", from: "2026-06-30", to: "2025-07-01", scope: "all_universe" as const }], /from must be on or before to/],
    [[{ id: "a", from: "20250701", to: "2026-06-30", scope: "all_universe" as const }], /must be YYYY-MM-DD/],
    [[{ id: "a", from: "2025-07-01", to: "2026-06-30", scope: "named_codes" as const }], /requires codes/],
    [
      [
        { id: "a", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" as const },
        { id: "a", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" as const },
      ],
      /duplicate holdout window id/,
    ],
  ] as const) {
    assert.throws(
      () => partitionByHoldout({ samples: [], manifest: { ...MANIFEST, windows: [...windows] } }),
      pattern,
    );
  }
}

function testMalformedSampleDateFailsClosed() {
  assert.throws(
    () => partitionByHoldout({
      samples: [{ id: "bad", code: "8136", date: "2025/07/01" }],
      manifest: MANIFEST,
    }),
    /must be YYYY-MM-DD/,
  );
}

function testRealVaultManifestParses() {
  // 実ファイルの形が変わったら気づけるようにする。
  const manifest = JSON.parse(
    readFileSync("research/holdout/vault.manifest.json", "utf-8"),
  ) as HoldoutVaultManifest;
  const result = partitionByHoldout({
    samples: [{ id: "probe", code: "8136", date: "2026-01-15" }],
    manifest,
  });
  assert.equal(result.excluded.length, 1, "実 manifest でも封印期間が効く");
}

testSealedSamplesAreExcludedByDefault();
testExclusionIsAlwaysVisible();
testBoundaryDatesAreInclusive();
testOpeningRequiresAnAccessRecord();
testOpeningWithRecordWorksAndWarns();
testUnknownWindowIsRejected();
testNamedCodesScope();
testMalformedManifestFailsClosed();
testMalformedSampleDateFailsClosed();
testRealVaultManifestParses();

console.log("research/holdout-partition: 全テスト成功");
