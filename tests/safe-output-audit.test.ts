// safe-output audit のテスト
// 危険表現の検出と、否定文・禁止説明の許可（false positive 回避）

import assert from "node:assert/strict";
import { scanContentForUnsafeOutput, SAFE_OUTPUT_PATTERNS } from "../src/safe-output-audit.js";

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

console.log("safe-output-audit: 全テスト成功");
