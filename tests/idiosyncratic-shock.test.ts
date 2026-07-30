import assert from "node:assert/strict";
import {
  buildNotificationDecision,
  calculateShockDrawdownPct,
  findClosestHistoricalCases,
  inferPriceState,
  labelShockScore,
  totalShockScore,
  type ShockCandidate,
  type ShockDimensionScores,
} from "../src/idiosyncratic-shock.js";
import { loadHistoricalShockCases } from "../src/idiosyncratic-shock-data.js";

function scores(values: Partial<ShockDimensionScores> = {}): ShockDimensionScores {
  return {
    businessImpactContainment: 2,
    accountingIntegrity: 2,
    actorSeparability: 2,
    organizationalContainment: 2,
    regulatoryContainment: 2,
    brandResilience: 2,
    managementContinuity: 2,
    fundamentalResilience: 2,
    discountMagnitude: 1,
    priceStabilization: 2,
    ...values,
  };
}

assert.equal(totalShockScore(scores()), 19);
assert.equal(labelShockScore(19), "research_priority");
assert.equal(labelShockScore(12), "watch");
assert.equal(labelShockScore(8), "caution");
assert.equal(labelShockScore(7), "avoid");

const base: ShockCandidate = {
  id: "test",
  code: "9999",
  company: "Test",
  detectedAt: "2026-07-01",
  category: "executive_relationship",
  actorType: "ceo",
  eventSummary: "test event",
  macroPrimaryCause: false,
  evidenceStatus: "confirmed",
  investigationStatus: "not_applicable",
  priceState: "stabilized_after_drop",
  shockDrawdownPct: -10,
  scores: scores(),
  criticalLicenseOrDelistingRisk: false,
  sources: [{ title: "company", url: "https://example.com", sourceType: "company" }],
};

assert.equal(buildNotificationDecision(base).eligible, true, "高得点 + 一次情報 + 調査範囲確定 + 実下落 + 下落一巡なら通知候補");

const noShock = buildNotificationDecision({ ...base, shockDrawdownPct: -1 });
assert.equal(noShock.eligible, false, "下落していない横ばい案件は通知禁止");
assert(noShock.blockers.some(value => value.startsWith("shockDrawdownPct=")));

const shockUnknown = buildNotificationDecision({ ...base, shockDrawdownPct: null });
assert.equal(shockUnknown.eligible, false, "ショック下落率不明はfail-closed");
assert(shockUnknown.blockers.includes("shockDrawdownPct is missing"));

const investigationOpen = buildNotificationDecision({ ...base, investigationStatus: "open" });
assert.equal(investigationOpen.eligible, false, "調査継続中は12点以上でも通知禁止");
assert(investigationOpen.blockers.includes("investigationStatus=open"));

const investigationUnknown = buildNotificationDecision({ ...base, investigationStatus: undefined });
assert.equal(investigationUnknown.eligible, false, "調査状態不明はfail-closed");
assert(investigationUnknown.blockers.includes("investigationStatus=unknown"));

const stillFalling = buildNotificationDecision({ ...base, priceState: "falling", scores: scores({ priceStabilization: 0 }) });
assert.equal(stillFalling.eligible, false, "急落中は12点以上でも通知禁止");
assert(stillFalling.blockers.some(value => value.includes("priceState=falling")));

const rebounded = buildNotificationDecision({ ...base, priceState: "rebounded_too_fast", scores: scores({ priceStabilization: 0 }) });
assert.equal(rebounded.eligible, false, "急反発後のFOMO通知は禁止");

const accountingFraud = buildNotificationDecision({
  ...base,
  scores: scores({ accountingIntegrity: 0, discountMagnitude: 2 }),
});
assert.equal(accountingFraud.eligible, false, "粉飾/重大会計不正は強制ブロック");
assert(accountingFraud.blockers.includes("accountingIntegrity=0"));

const reportedOnly = buildNotificationDecision({ ...base, evidenceStatus: "reported" });
assert.equal(reportedOnly.eligible, false, "報道だけでは強通知へ上げない");

const macro = buildNotificationDecision({ ...base, macroPrimaryCause: true });
assert.equal(macro.eligible, false, "マクロ主因はこのレイヤーから除外");

const mediaOnlyOne = buildNotificationDecision({
  ...base,
  sources: [{ title: "media", url: "https://example.com/media", sourceType: "major_media" }],
});
assert.equal(mediaOnlyOne.eligible, false, "一次情報なし + major media 1社だけでは通知しない");

const mediaTwo = buildNotificationDecision({
  ...base,
  sources: [
    { title: "media1", url: "https://example.com/1", sourceType: "major_media" },
    { title: "media2", url: "https://example.com/2", sourceType: "major_media" },
  ],
});
assert.equal(mediaTwo.eligible, true, "独立major media 2件なら証拠ゲートを満たせる");

assert.equal(calculateShockDrawdownPct([
  { date: "2026-06-30", close: 100 },
  { date: "2026-07-01", close: 95 },
  { date: "2026-07-02", close: 90 },
  { date: "2026-07-03", close: 93 },
], "2026-07-01"), -10, "事件前価格からevent後安値までをショック下落率にする");
assert.equal(calculateShockDrawdownPct([
  { date: "2026-07-01", close: 95 },
  { date: "2026-07-02", close: 90 },
], "2026-07-01"), null, "事件前価格がなければ下落率は不明");

assert.equal(inferPriceState([
  { date: "2026-07-01", close: 94 },
  { date: "2026-07-02", close: 90 },
  { date: "2026-07-03", close: 91 },
  { date: "2026-07-06", close: 92 },
  { date: "2026-07-07", close: 93 },
]), "stabilized_after_drop", "安値後3営業日程度の沈静化を検出");

assert.equal(inferPriceState([
  { date: "2026-07-01", close: 100 },
  { date: "2026-07-02", close: 95 },
  { date: "2026-07-03", close: 90 },
  { date: "2026-07-06", close: 85 },
  { date: "2026-07-07", close: 80 },
]), "falling", "安値更新中は falling");

assert.equal(inferPriceState([
  { date: "2026-07-01", close: 80 },
  { date: "2026-07-02", close: 82 },
  { date: "2026-07-03", close: 88 },
  { date: "2026-07-06", close: 92 },
  { date: "2026-07-07", close: 94 },
]), "rebounded_too_fast", "急反発は追いかけない");

const historical = loadHistoricalShockCases();
assert(historical.length >= 55, `過去事例は55件以上必要: ${historical.length}`);
assert.equal(new Set(historical.map(item => item.id)).size, historical.length, "historical idは重複禁止");
assert(historical.some(item => item.category === "employee_sabotage"), "バイトテロ事例が必要");
assert(historical.some(item => item.category === "customer_sabotage"), "顧客迷惑動画事例が必要");
assert(historical.some(item => item.category === "personal_behavior"), "個人行動規範違反が必要");
assert(historical.some(item => item.category === "personal_crime"), "個人犯罪の境界例が必要");
assert(historical.some(item => item.category === "accounting_fraud"), "会計不正の負例が必要");
assert(historical.some(item => item.category === "systemic_misconduct"), "組織不正の負例が必要");
assert(historical.some(item => item.category === "quality_falsification"), "品質偽装の負例が必要");
assert(historical.some(item => item.category === "product_safety"), "製品安全の負例が必要");
assert(historical.some(item => item.category === "improper_sales"), "不適切販売の負例が必要");
assert(historical.some(item => item.score >= 16), "research priority型の過去事例が必要");
assert(historical.some(item => item.score < 8), "avoid型の過去事例が必要");
assert(!historical.some(item => item.scores.accountingIntegrity === 0 && item.score >= 12), "会計健全性0で12点以上は禁止");

const baito: ShockCandidate = {
  ...base,
  id: "new-baito",
  category: "employee_sabotage",
  actorType: "employee",
  scores: scores({ brandResilience: 1 }),
};
const analogues = findClosestHistoricalCases(baito, historical, 5);
assert.equal(analogues.length, 5);
assert(
  analogues.slice(0, 3).some(row => row.item.category === "employee_sabotage"),
  "バイトテロ候補の上位類似に employee_sabotage が入る"
);
assert(!analogues.some(row => row.item.id === baito.id), "自己参照しない");

const ootoya = historical.find(item => item.id === "ootoya-2019-employee-video");
const sukiya = historical.find(item => item.id === "zensho-sukiya-2019-employee-video");
assert(ootoya && sukiya, "バイトテロの重い例/軽い例を両方保持");
assert((ootoya?.score ?? 99) < (sukiya?.score ?? 0), "全店休業まで波及した大戸屋は局所切離型すき家より低評価");

const kdp = historical.find(item => item.id === "keurig-dr-pepper-2022-ceo-conduct");
assert.equal(kdp?.score, 18, "事業・財務と無関係が明示されたKDPを高得点比較例に保持");

const wwe = historical.find(item => item.id === "wwe-2022-mcmahon");
assert.equal(wwe?.scores.accountingIntegrity, 0, "女問題でも財務訂正を伴うWWEは会計ゲートで止める");

const kddi = historical.find(item => item.id === "kddi-2026-biglobe-circular-transactions");
assert.equal(kddi?.scores.accountingIntegrity, 0, "少人数起因でも過年度訂正ならKDDIは会計ゲートで止める");
const airWater = historical.find(item => item.id === "airwater-2026-improper-accounting");
assert((airWater?.score ?? 99) < 8, "複数拠点・経営層関与の不適切会計はavoid帯に置く");

const nomura = historical.find(item => item.id === "nomura-2024-former-employee-robbery");
assert(nomura && nomura.actorType === "employee", "顧客接点の従業員個人犯罪を境界例として保持");
assert((nomura?.score ?? 99) < 16, "金融の顧客信頼へ波及する個人犯罪はresearch_priorityへ上げない");

const mitsubishi = historical.find(item => item.id === "mitsubishi-electric-2021-quality-misconduct");
assert((mitsubishi?.score ?? 99) < 8, "全社品質不正へ拡大した三菱電機はavoid帯");
const toyo = historical.find(item => item.id === "toyo-tire-2015-seismic-rubber");
assert((toyo?.score ?? 99) < 8, "認定・製品交換へ直結するTOYO TIREはavoid帯");

const sanrio = historical.find(item => item.id === "sanrio-2026-compensation");
assert(sanrio, "サンリオ現行ケースを過去/進行事例DBに保持");
assert.equal(sanrio?.priceStateAtCheckpoint, "rebounded_too_fast", "サンリオは急反発を別ゲートで止める");

console.log(`idiosyncratic-shock tests: OK (${historical.length} historical cases)`);
