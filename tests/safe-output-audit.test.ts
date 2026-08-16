// safe-output audit のテスト
// 危険表現の検出と、否定文・禁止説明の許可（false positive 回避）

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeOutputAuditGap } from "../src/ops-dashboard-safe-output-health.js";
import {
  collectSafeOutputFiles,
  scanContentForUnsafeOutput,
  SAFE_OUTPUT_PATTERNS,
  safeOutputHealthStatus,
} from "../src/safe-output-audit.js";

const j = (...parts: string[]) => parts.join("");

{
  const dangerous = SAFE_OUTPUT_PATTERNS[0];
  const content = [
    `この銘柄は${dangerous}だ`,
    `これは${dangerous}ではない`,
    `${dangerous}という表現は禁止`,
    "調査候補として保留する",
  ].join("\n");
  const findings = scanContentForUnsafeOutput(content, "docs/sample.md");
  assert.equal(findings.length, 1, "肯定文のみ検出し、否定文・禁止説明は許可");
  assert.equal(findings[0].line, 1);
  assert.ok(!findings[0].context.includes(dangerous), "出力に原文を含めない（マスク済み）");
  console.log("safe-output: 危険表現の検出と否定文の許可");
}

{
  const negated = [j("買い推奨ではな", "く"), "、調査候補として扱う"].join("");
  const findings = scanContentForUnsafeOutput(negated, "src/sample.ts");
  assert.equal(findings.length, 0, "「ではなく」も許可される");
  console.log("safe-output: ではなく 形の否定も許可");
}

{
  assert.ok(SAFE_OUTPUT_PATTERNS.length >= 10, "主要な危険表現をカバー");
  assert.equal(new Set(SAFE_OUTPUT_PATTERNS).size, SAFE_OUTPUT_PATTERNS.length, "パターン重複なし");
  console.log("safe-output: パターン定義の健全性");
}

{
  assert.equal(safeOutputHealthStatus(0, 0), "ok");
  assert.equal(safeOutputHealthStatus(1, 0), "needs_attention");
  assert.equal(safeOutputHealthStatus(0, 1), "action_required", "監査対象を読めない場合は false-green にしない");
  assert.equal(safeOutputHealthStatus(1, 1), "action_required");
  console.log("safe-output: 読み込み失敗は action_required");
}

{
  assert.equal(safeOutputAuditGap(null), "missing_report", "監査レポート欠落/破損を正常扱いしない");
  assert.equal(
    safeOutputAuditGap({ healthStatus: "action_required", findingsCount: 0, scanErrors: [{}] }),
    "scan_failure",
  );
  assert.equal(safeOutputAuditGap({ healthStatus: "ok", findingsCount: 0, scanErrors: [] }), null);
  assert.equal(
    safeOutputAuditGap({ healthStatus: "action_required", findingsCount: 0, scanErrors: [] }),
    "invalid_report",
    "action_requiredなのにscan errorが無い矛盾reportをfalse-greenにしない",
  );
  assert.equal(
    safeOutputAuditGap({ healthStatus: "needs_attention", findingsCount: 0, scanErrors: [] }),
    "invalid_report",
    "needs_attentionなのにfindingが無い矛盾reportをfalse-greenにしない",
  );
  assert.equal(
    safeOutputAuditGap({ healthStatus: "unexpected", findingsCount: 0, scanErrors: [] }),
    "invalid_report",
    "unknown healthStatusを正常扱いしない",
  );
  console.log("safe-output: Ops Dashboard は監査レポート欠落・状態矛盾をfail-closed化");
}

{
  const dir = mkdtempSync(join(tmpdir(), "safe-output-inventory-"));
  try {
    const validPath = join(dir, "valid.ts");
    writeFileSync(validPath, "export const ok = true;\n", "utf-8");
    symlinkSync(join(dir, "missing-target"), join(dir, "broken.ts"));

    const inventory = collectSafeOutputFiles(dir);
    assert.deepEqual(inventory.files, [validPath], "読める監査対象はbroken entryがあっても継続列挙する");
    assert.equal(inventory.errors.length, 1, "stat不能な監査対象をsilent skipしない");
    assert.equal(inventory.errors[0].file, join(dir, "broken.ts"));
    assert.equal(
      safeOutputHealthStatus(0, inventory.errors.length),
      "action_required",
      "監査inventoryの欠落はfalse-greenではなくaction_requiredにする",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("safe-output: inventory列挙失敗を監査不能として保持");
}

{
  const missingDir = join(tmpdir(), "safe-output-missing-dir-does-not-exist");
  rmSync(missingDir, { recursive: true, force: true });
  const inventory = collectSafeOutputFiles(missingDir);
  assert.deepEqual(inventory.files, []);
  assert.equal(inventory.errors.length, 1, "configured scan directoryを列挙できない場合もsilent skipしない");
}

console.log("safe-output-audit: 全テスト成功");