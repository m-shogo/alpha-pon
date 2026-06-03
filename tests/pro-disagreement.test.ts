// Pro委員会 食い違い検出テスト
// pnpm test および pnpm verify:pro で実行される

import assert from "node:assert/strict";
import type { ProVerdict } from "../src/pro-types.js";
import {
  detectAgreementLevel,
  detectDisagreements,
  applySafetyRule,
  toProScore,
  deriveOriginalFinalLabel,
  isBlock,
  isEvidenceGap,
  isCautious,
} from "../src/pro-disagreement.js";

// ---- ユーティリティ ----

function makeVerdict(
  agentId: string,
  stance: ProVerdict["stance"],
  points: string[] = []
): ProVerdict {
  return {
    agentId,
    agentLabel: agentId,
    stance,
    points,
    isBlock: stance === "避ける",
    isEvidenceGap: stance === "証拠不足",
    isCautious: stance === "注意" || stance === "保留",
  };
}

// ---- isBlock / isEvidenceGap / isCautious ----

{
  assert.equal(isBlock({ stance: "避ける" }), true, "避けるはblock");
  assert.equal(isBlock({ stance: "保留" }), false, "保留はblock非該当");
  assert.equal(isBlock({ stance: "証拠不足" }), false, "証拠不足はblockではない");
  assert.equal(isEvidenceGap({ stance: "証拠不足" }), true, "証拠不足はevidenceGap");
  assert.equal(isEvidenceGap({ stance: "避ける" }), false, "避けるはevidenceGap非該当");
  assert.equal(isCautious({ stance: "注意" }), true, "注意はcautious");
  assert.equal(isCautious({ stance: "保留" }), true, "保留はcautious");
  assert.equal(isCautious({ stance: "調査候補" }), false, "調査候補はcautious非該当");
}

// ---- detectAgreementLevel ----

{
  const allAgree = [
    makeVerdict("a", "保留"),
    makeVerdict("b", "保留"),
    makeVerdict("c", "保留"),
  ];
  assert.equal(detectAgreementLevel(allAgree), "full_agree", "全員同じはfull_agree");
}

{
  const mildDiff = [
    makeVerdict("a", "調査候補"),
    makeVerdict("b", "保留"),
  ];
  assert.equal(detectAgreementLevel(mildDiff), "mostly_agree", "2種類のみはmostly_agree");
}

{
  const withBlock = [
    makeVerdict("a", "避ける"),
    makeVerdict("b", "保留"),
    makeVerdict("c", "保留"),
  ];
  assert.equal(detectAgreementLevel(withBlock), "mixed", "blockのみあり、positiveなしはmixed");
}

{
  const conflict = [
    makeVerdict("a", "避ける"),
    makeVerdict("b", "調査候補"),
    makeVerdict("c", "保留"),
  ];
  assert.equal(detectAgreementLevel(conflict), "conflict", "blockとpositiveが共存はconflict");
}

// ---- detectDisagreements ----

{
  const noDisagree = [
    makeVerdict("a", "保留"),
    makeVerdict("b", "保留"),
  ];
  const result = detectDisagreements(noDisagree);
  assert.equal(result.length, 0, "全員保留なら disagreements なし");
}

{
  const blockAndPositive = [
    makeVerdict("risk", "避ける", ["リスクあり"]),
    makeVerdict("theme", "調査候補", ["有望"]),
  ];
  const result = detectDisagreements(blockAndPositive);
  assert.equal(result.length, 1, "blockとpositiveが共存したら disagreement 1件");
  assert.ok(result[0].topic.includes("避けるvs調査候補"), "topicに避けるvs調査候補が含まれる");
  assert.ok(result[0].agents.includes("risk"), "blockエージェントがagentsに含まれる");
  assert.ok(result[0].agents.includes("theme"), "positiveエージェントがagentsに含まれる");
}

{
  const gapAndPositive = [
    makeVerdict("valuation", "証拠不足", ["バリュエーション未確認"]),
    makeVerdict("theme", "調査候補", ["テーマ一致"]),
  ];
  const result = detectDisagreements(gapAndPositive);
  assert.equal(result.length, 1, "証拠不足とpositiveが共存したら disagreement 1件");
  assert.ok(result[0].topic.includes("証拠不足vs調査候補"), "topicに証拠不足vs調査候補が含まれる");
}

{
  const both = [
    makeVerdict("risk", "避ける", ["要注意"]),
    makeVerdict("valuation", "証拠不足", ["バリュエーション未確認"]),
    makeVerdict("theme", "調査候補", ["テーマ一致"]),
  ];
  const result = detectDisagreements(both);
  assert.equal(result.length, 2, "2種類の disagreement が検出される");
}

// ---- applySafetyRule ----

{
  const noBlock = [makeVerdict("a", "調査候補"), makeVerdict("b", "保留")];
  assert.equal(applySafetyRule("調査候補", noBlock), "調査候補", "blockなしはそのまま");
}

{
  const withBlock = [makeVerdict("a", "避ける"), makeVerdict("b", "調査候補")];
  assert.equal(applySafetyRule("調査候補", withBlock), "避ける", "blockがあれば避けるに上書き");
}

{
  // 証拠不足はblockではない
  const gapOnly = [makeVerdict("a", "証拠不足"), makeVerdict("b", "調査候補")];
  assert.equal(applySafetyRule("調査候補", gapOnly), "調査候補", "証拠不足はblockにならない");
}

// ---- toProScore ----

{
  const verdicts = [makeVerdict("a", "調査候補"), makeVerdict("b", "保留")];
  const score = toProScore(verdicts);
  assert.ok(score > 0.5 && score <= 0.8, `スコアが期待範囲内: ${score}`);
}

{
  const allBlock = [makeVerdict("a", "避ける"), makeVerdict("b", "避ける")];
  assert.equal(toProScore(allBlock), 0.0, "全員避けるはスコア0");
}

// ---- deriveOriginalFinalLabel ----

{
  const allEvidence = [makeVerdict("a", "証拠不足"), makeVerdict("b", "証拠不足"), makeVerdict("c", "保留")];
  assert.equal(deriveOriginalFinalLabel(allEvidence), "証拠不足", "証拠不足が過半数なら証拠不足");
}

{
  const multiHold = [makeVerdict("a", "保留"), makeVerdict("b", "保留"), makeVerdict("c", "証拠不足")];
  assert.equal(deriveOriginalFinalLabel(multiHold), "保留", "保留が複数で証拠不足が少数なら保留");
}

{
  const withNote = [makeVerdict("a", "調査候補"), makeVerdict("b", "注意")];
  assert.equal(deriveOriginalFinalLabel(withNote), "保留", "注意があれば保留");
}

{
  const positive = [makeVerdict("a", "調査候補"), makeVerdict("b", "調査候補")];
  assert.equal(deriveOriginalFinalLabel(positive), "調査候補", "全員調査候補なら調査候補");
}

// ---- 安全ルールとoriginalFinalLabelの分離 ----

{
  // 「調査候補」と判断できそうだが risk_manager が避けると言った場合
  const verdicts = [
    makeVerdict("theme", "調査候補"),
    makeVerdict("buffett", "保留"),
    makeVerdict("risk", "避ける"),
  ];
  const original = deriveOriginalFinalLabel(verdicts);
  const final = applySafetyRule(original, verdicts);
  // original は "避ける" (blockがあれば deriveOriginalFinalLabel も避けるを返す)
  assert.equal(original, "避ける", "blockがあればoriginalFinalLabelも避ける");
  assert.equal(final, "避ける", "安全ルール後も避ける");
}

console.log("pro-disagreement.test.ts passed");
