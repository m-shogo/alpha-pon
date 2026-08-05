import assert from "node:assert/strict";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";

const historical = loadHistoricalShockCases();
assert(historical.length >= 65, `過去事例は65件以上必要: ${historical.length}`);
assert.equal(new Set(historical.map(item => item.id)).size, historical.length, "historical idは重複禁止");

const byId = new Map(historical.map(item => [item.id, item]));

const mufg = byId.get("mufg-2024-safe-deposit-theft");
assert(mufg, "MUFG貸金庫事件を金融の個人犯罪境界例として保持");
assert.equal(mufg.actorType, "employee");
assert(mufg.score >= 12 && mufg.score < 16, "MUFGはwatch帯の境界例");

const daiichi = byId.get("daiichi-life-2020-former-employee-fraud");
assert(daiichi);
assert.equal(daiichi.category, "systemic_misconduct");
assert(daiichi.score < 8, "企業風土まで原因認定された第一生命はavoid帯");

const kepco = byId.get("kansai-electric-2019-gifts");
assert(kepco);
assert.equal(kepco.category, "organizational_governance");
assert(kepco.score < 8, "多数役職員・業務改善命令まで広がる金品問題はavoid帯");

const smfg = byId.get("smfg-2022-nikko-market-manipulation");
assert(smfg);
assert.equal(smfg.category, "systemic_misconduct");
assert(smfg.score < 8, "法人起訴・行政処分・親会社改善命令はavoid帯");

const united = byId.get("united-2017-flight3411");
assert(united);
assert.equal(united.actorType, "organization");
assert.equal(united.score, 10);
assert.equal(united.priceStateAtCheckpoint, "unknown");
assert.equal(united.outcome?.recoveryPattern, "unknown");

const backlogScores = new Map<string, number>([
  ["benesse-2014-data-leak", 9],
  ["dentsu-2016-labor-violation", 8],
  ["chipotle-2015-ecoli", 7],
  ["guess-2018-marciano", 12],
  ["starbucks-2018-philadelphia", 11],
]);
for (const [id, expectedScore] of backlogScores) {
  const item = byId.get(id);
  assert(item, `${id}: outcome-blind backlog promotion must exist`);
  assert.equal(item.score, expectedScore, `${id}: PIT score must stay frozen`);
  assert.equal(item.priceStateAtCheckpoint, "unknown", `${id}: later price path must not leak into score`);
  assert.equal(item.outcome?.recoveryPattern, "unknown", `${id}: future recovery must not leak into case seed`);
}
assert.equal(byId.get("chipotle-2015-ecoli")?.score, 7, "candidate may legitimately fall below research band");
assert.equal(byId.get("guess-2018-marciano")?.score, 12, "candidate may legitimately land at production threshold");

const highConfidence = historical.filter(item => item.researchConfidence === "high").length;
assert(highConfidence >= 26, `high-confidence事例を厚く保つ: ${highConfidence}`);

console.log(`idiosyncratic-shock-expansions tests: OK (${historical.length} historical cases, high=${highConfidence}, outcome-blind backlog=5)`);
