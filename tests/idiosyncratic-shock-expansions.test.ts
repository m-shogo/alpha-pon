import assert from "node:assert/strict";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";

const historical = loadHistoricalShockCases();
assert(historical.length >= 60, `過去事例は60件以上必要: ${historical.length}`);
assert.equal(new Set(historical.map(item => item.id)).size, historical.length, "historical idは重複禁止");

const byId = new Map(historical.map(item => [item.id, item]));

const mufg = byId.get("mufg-2024-safe-deposit-theft");
assert(mufg, "MUFG貸金庫事件を金融の個人犯罪境界例として保持");
assert.equal(mufg?.actorType, "employee");
assert((mufg?.score ?? 0) >= 12 && (mufg?.score ?? 99) < 16, "MUFGはwatch帯の境界例");

const daiichi = byId.get("daiichi-life-2020-former-employee-fraud");
assert(daiichi, "第一生命2020を個人起点→組織問題拡大型として保持");
assert.equal(daiichi?.category, "systemic_misconduct");
assert((daiichi?.score ?? 99) < 8, "企業風土まで原因認定された第一生命はavoid帯");

const kepco = byId.get("kansai-electric-2019-gifts");
assert(kepco, "関西電力金品受領問題を組織ガバナンス負例として保持");
assert.equal(kepco?.category, "organizational_governance");
assert((kepco?.score ?? 99) < 8, "多数役職員・業務改善命令まで広がる金品問題はavoid帯");

const smfg = byId.get("smfg-2022-nikko-market-manipulation");
assert(smfg, "SMBC日興相場操縦を規制・組織負例として保持");
assert.equal(smfg?.category, "systemic_misconduct");
assert((smfg?.score ?? 99) < 8, "法人起訴・行政処分・親会社改善命令はavoid帯");

const united = byId.get("united-2017-flight3411");
assert(united, "United 3411をUSの低score policy-shock境界例として保持");
assert.equal(united.actorType, "organization");
assert.equal(united.score, 10, "組織ポリシー・顧客信頼を低く評価し、価格未検証を楽観化しない");
assert.equal(united.priceStateAtCheckpoint, "unknown", "正式price replay前にstabilizedを後付けしない");
assert.equal(united.outcome?.recoveryPattern, "unknown", "historical future outcomeをcase seedへ逆流させない");

const highConfidence = historical.filter(item => item.researchConfidence === "high").length;
assert(highConfidence >= 21, `high-confidence事例を厚く保つ: ${highConfidence}`);

console.log(`idiosyncratic-shock-expansions tests: OK (${historical.length} historical cases, high=${highConfidence})`);
