// Pro委員会 生成JSONの形検査テスト
// pnpm verify:pro で実行される
// 前提: pnpm pro:committee && pnpm ui:data が先に実行済みであること

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// ---- reports/stock_pro_committee_latest.json ----

const committeeJsonPath = `${ROOT}/reports/stock_pro_committee_latest.json`;
assert.ok(existsSync(committeeJsonPath), `reports/stock_pro_committee_latest.json が存在しない。pnpm pro:committee を実行してください`);

const committeeJson = JSON.parse(readFileSync(committeeJsonPath, "utf-8"));
assert.ok(typeof committeeJson === "object", "committee JSON はオブジェクト");
assert.ok(typeof committeeJson.generatedAt === "string", "generatedAt が文字列");
assert.ok(Array.isArray(committeeJson.decisions), "decisions が配列");

if (committeeJson.decisions.length > 0) {
  const d = committeeJson.decisions[0];

  // 必須フィールドの存在確認
  const requiredFields = [
    "code",
    "name",
    "originalFinalLabel",
    "finalLabel",
    "finalScore",
    "proScore",
    "verdicts",
    "legendVerdicts",
    "legendWarnings",
    "consensus",
    "disagreements",
    "nextActions",
    "blockers",
    "missingEvidence",
  ];
  for (const f of requiredFields) {
    assert.ok(f in d, `decision に "${f}" フィールドが必要`);
  }

  // 型確認
  assert.ok(typeof d.code === "string", "code は文字列");
  assert.ok(typeof d.name === "string", "name は文字列");
  assert.ok(typeof d.originalFinalLabel === "string", "originalFinalLabel は文字列");
  assert.ok(typeof d.finalLabel === "string", "finalLabel は文字列");
  assert.ok(typeof d.finalScore === "number", "finalScore は数値");
  assert.ok(typeof d.proScore === "number", "proScore は数値");
  assert.ok(Array.isArray(d.verdicts), "verdicts は配列");
  assert.ok(Array.isArray(d.legendVerdicts), "legendVerdicts は配列");
  assert.ok(Array.isArray(d.legendWarnings), "legendWarnings は配列");
  assert.ok(typeof d.consensus === "string", "consensus は文字列");
  assert.ok(Array.isArray(d.disagreements), "disagreements は配列");
  assert.ok(Array.isArray(d.nextActions), "nextActions は配列");
  assert.ok(Array.isArray(d.blockers), "blockers は配列");
  assert.ok(Array.isArray(d.missingEvidence), "missingEvidence は配列");

  // verdicts の形確認
  if (d.verdicts.length > 0) {
    const v = d.verdicts[0];
    assert.ok(typeof v.agentId === "string", "verdict.agentId は文字列");
    assert.ok(typeof v.agentLabel === "string", "verdict.agentLabel は文字列");
    assert.ok(typeof v.stance === "string", "verdict.stance は文字列");
    assert.ok(Array.isArray(v.points), "verdict.points は配列");
    assert.ok(typeof v.isBlock === "boolean", "verdict.isBlock は boolean");
    assert.ok(typeof v.isEvidenceGap === "boolean", "verdict.isEvidenceGap は boolean");
    assert.ok(typeof v.isCautious === "boolean", "verdict.isCautious は boolean");
  }

  // disagreements の形確認
  if (d.disagreements.length > 0) {
    const dis = d.disagreements[0];
    assert.ok(typeof dis.topic === "string", "disagreement.topic は文字列");
    assert.ok(Array.isArray(dis.agents), "disagreement.agents は配列");
    assert.ok(Array.isArray(dis.stances), "disagreement.stances は配列");
    assert.ok(typeof dis.description === "string", "disagreement.description は文字列");
  }

  // finalLabel は有効なラベルのみ
  const validLabels = ["調査候補", "保留", "証拠不足", "注意", "避ける"];
  for (const dec of committeeJson.decisions) {
    assert.ok(
      validLabels.includes(dec.finalLabel),
      `finalLabel "${dec.finalLabel}" (${dec.code}) は有効なラベルではない`
    );
    assert.ok(
      validLabels.includes(dec.originalFinalLabel),
      `originalFinalLabel "${dec.originalFinalLabel}" (${dec.code}) は有効なラベルではない`
    );
  }

  // consensus は有効な値のみ
  const validConsensus = ["full_agree", "mostly_agree", "mixed", "conflict"];
  for (const dec of committeeJson.decisions) {
    assert.ok(
      validConsensus.includes(dec.consensus),
      `consensus "${dec.consensus}" (${dec.code}) は有効な値ではない`
    );
  }

  console.log(
    `committee JSON: ${committeeJson.decisions.length} decisions, ` +
    `labels: ${committeeJson.decisions.map((d: { code: string; finalLabel: string }) => `${d.code}=${d.finalLabel}`).join(" ")}`
  );
} else {
  console.log("committee JSON: decisions が空 (会社が登録されていない可能性あり)");
}

// ---- apps/web/public/generated/alpha-pon-data.json ----

const dataJsonPath = `${ROOT}/apps/web/public/generated/alpha-pon-data.json`;
assert.ok(existsSync(dataJsonPath), `apps/web/public/generated/alpha-pon-data.json が存在しない。pnpm ui:data を実行してください`);

const dataJson = JSON.parse(readFileSync(dataJsonPath, "utf-8"));

// legendProCommittee の存在確認
assert.ok("legendProCommittee" in dataJson, "alpha-pon-data.json に legendProCommittee が必要");
assert.ok("buffettQuality" in dataJson, "alpha-pon-data.json に buffettQuality が必要");
assert.ok("valuationSnapshots" in dataJson, "alpha-pon-data.json に valuationSnapshots が必要");
assert.ok("irEventEvidence" in dataJson, "alpha-pon-data.json に irEventEvidence が必要");
assert.ok("stockProCommitteeJson" in dataJson, "alpha-pon-data.json に stockProCommitteeJson が必要");

if (dataJson.legendProCommittee !== null) {
  const lpc = dataJson.legendProCommittee;
  assert.ok(Array.isArray(lpc.decisions), "legendProCommittee.decisions は配列");

  if (lpc.decisions.length > 0) {
    const d = lpc.decisions[0];
    assert.ok("consensus" in d, "legendProCommittee.decisions[].consensus が必要");
    assert.ok("disagreements" in d, "legendProCommittee.decisions[].disagreements が必要");
    assert.ok("finalLabel" in d, "legendProCommittee.decisions[].finalLabel が必要");
    assert.ok("originalFinalLabel" in d, "legendProCommittee.decisions[].originalFinalLabel が必要");
    console.log(
      `legendProCommittee: ${lpc.decisions.length} decisions, ` +
      `consensus: ${[...new Set(lpc.decisions.map((d: { consensus: string }) => d.consensus))].join(", ")}`
    );
  } else {
    console.log("legendProCommittee.decisions が空");
  }
} else {
  console.log("legendProCommittee が null (pnpm pro:committee を先に実行してください)");
}

console.log("pro-generated-data-shape.test.ts passed");
