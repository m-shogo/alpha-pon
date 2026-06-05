// 特殊状況・時間差再評価ウォッチの構造テスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 1) reports/special_situation_watch_latest.json が生成される
const reportData = readJson("reports/special_situation_watch_latest.json");
assert(reportData !== null, "reports/special_situation_watch_latest.json は必ず生成される必要があります");
assert(isObject(reportData), "special_situation_watch_latest.json は object である必要があります");

// 2) patterns / candidates / topChanceList / referenceEvents / outcomeStats が配列
assert(Array.isArray(reportData.patterns), "patterns は配列である必要があります");
assert(reportData.patterns.length > 0, "patterns は1件以上必要です");
assert(Array.isArray(reportData.candidates), "candidates は配列である必要があります");
assert(reportData.candidates.length > 0, "candidates は1件以上必要です");
assert(Array.isArray(reportData.topChanceList), "topChanceList は配列である必要があります");
assert(Array.isArray(reportData.referenceEvents), "referenceEvents は配列である必要があります");
assert(Array.isArray(reportData.outcomeStats), "outcomeStats は配列である必要があります");

// outcomeStats の検証
const ALLOWED_OUTCOME_GROUP_TYPES = new Set([
  "pattern", "watchPhase", "finalLabel", "chanceLevel",
  "sellerOverhang", "themeWasRight", "selectedCompanyFit", "themeCompanyFit",
]);
const presentGroupTypes = new Set<string>();
for (const row of reportData.outcomeStats as Array<Record<string, unknown>>) {
  assert(ALLOWED_OUTCOME_GROUP_TYPES.has(row.groupType as string), `不正な groupType: ${row.groupType}`);
  assert(typeof row.groupKey === "string", "groupKey は string");
  assert(typeof row.sampleSize === "number", "sampleSize は number");
  assert(typeof row.sampleTooSmall === "boolean", "sampleTooSmall は boolean");
  assert(row.avgReturn1w === null || typeof row.avgReturn1w === "number", "avgReturn1w は number|null");
  assert(row.avgReturn1m === null || typeof row.avgReturn1m === "number", "avgReturn1m は number|null");
  assert(row.avgTopixRelative1m === null || typeof row.avgTopixRelative1m === "number", "avgTopixRelative1m は number|null");
  assert(typeof row.note === "string", "note は string");
  if (row.sampleTooSmall === true) {
    assert(
      (row.note as string).includes("参考値") || (row.note as string).includes("強い判断に使わない"),
      `sampleTooSmall=true の note は参考値/強い判断に使わないを含む必要があります: ${row.note}`
    );
  }
  presentGroupTypes.add(row.groupType as string);
}
// 最低限のgroupTypeが存在することを確認
for (const required of ["pattern", "finalLabel", "sellerOverhang", "selectedCompanyFit"]) {
  assert(presentGroupTypes.has(required), `groupType=${required} が outcomeStats に含まれる必要があります`);
}

// 3) ラベルが許可リストのみ
const ALLOWED_FINAL_LABELS = new Set([
  "構造監視候補",
  "チャンス候補",
  "調査優先候補",
  "需給待ち",
  "市況待ち",
  "初回決算待ち",
  "ロックアップ待ち",
  "証拠不足",
  "罠注意",
  "避ける",
]);
const ALLOWED_CHANCE_LEVELS = new Set(["none", "watch", "attention", "high"]);
const ALLOWED_WATCH_PHASES = new Set([
  "pre_listing",
  "ipo_week",
  "first_earnings_wait",
  "lockup_wait",
  "sell_pressure_clearing",
  "cycle_confirmation",
  "fundamental_confirmation",
  "watch_only",
]);
const ALLOWED_CONFIDENCE = new Set(["official", "reported", "rumor", "unknown"]);
const ALLOWED_SELLER_TYPES = new Set([
  "parent_company", "pe_fund", "government", "founder",
  "strategic_holder", "multiple", "none", "unknown",
]);
const ALLOWED_SELLER_MOTIVATIONS = new Set([
  "fund_exit", "debt_reduction", "policy_sale", "portfolio_rebalance",
  "business_reorganization", "business_deterioration", "liquidity_event",
  "none", "unknown",
]);
const ALLOWED_REMAINING_OVERHANG = new Set(["cleared", "low", "medium", "high", "unknown"]);
const ALLOWED_THEME_WAS_RIGHT = new Set(["unknown", "too_early", "right", "wrong", "mixed"]);
const ALLOWED_SELECTED_COMPANY_FIT = new Set(["unknown", "too_early", "strong", "medium", "weak", "wrong_company"]);
const ALLOWED_BETTER_COMPANY_RELATION = new Set([
  "more_direct_beneficiary", "better_margin_exposure", "less_overhang",
  "better_liquidity", "already_priced_in", "unknown",
]);

for (const c of reportData.candidates as Array<Record<string, unknown>>) {
  assert(typeof c.code === "string" && c.code.length > 0, "candidate.code が必要");
  assert(typeof c.name === "string" && c.name.length > 0, "candidate.name が必要");
  assert(ALLOWED_FINAL_LABELS.has(c.finalLabel as string), `不正な finalLabel: ${c.finalLabel}`);
  assert(ALLOWED_CHANCE_LEVELS.has(c.chanceLevel as string), `不正な chanceLevel: ${c.chanceLevel}`);
  assert(ALLOWED_WATCH_PHASES.has(c.watchPhase as string), `不正な watchPhase: ${c.watchPhase}`);
  assert(typeof c.notificationEligible === "boolean", "notificationEligible は boolean");
  assert(Array.isArray(c.whyInteresting), "whyInteresting は配列");
  assert(Array.isArray(c.whyDangerous), "whyDangerous は配列");
  assert(Array.isArray(c.evidenceNeeded), "evidenceNeeded は配列");
  assert(Array.isArray(c.waitFor), "waitFor は配列");
  // whyNow / whyNotNow 検証
  assert(Array.isArray(c.whyNow), `候補 ${c.code}: whyNow は配列である必要があります`);
  assert(Array.isArray(c.whyNotNow), `候補 ${c.code}: whyNotNow は配列である必要があります`);
  // notificationEligible=true の場合は whyNotNow が空でないこと
  if (c.notificationEligible === true) {
    assert(
      Array.isArray(c.whyNotNow) && (c.whyNotNow as string[]).length > 0,
      `候補 ${c.code}: notificationEligible=true の場合 whyNotNow が空は禁止`
    );
  }
  // sellerPressureProfile の検証
  const spp = c.sellerPressureProfile as Record<string, unknown> | undefined;
  assert(spp !== undefined && typeof spp === "object", `候補 ${c.code}: sellerPressureProfile が必要`);
  assert(ALLOWED_SELLER_TYPES.has(spp.sellerType as string), `候補 ${c.code}: 不正な sellerType: ${spp.sellerType}`);
  assert(ALLOWED_SELLER_MOTIVATIONS.has(spp.sellerMotivation as string), `候補 ${c.code}: 不正な sellerMotivation: ${spp.sellerMotivation}`);
  assert(ALLOWED_REMAINING_OVERHANG.has(spp.remainingOverhang as string), `候補 ${c.code}: 不正な remainingOverhang: ${spp.remainingOverhang}`);
  assert(Array.isArray(spp.whyItMatters), `候補 ${c.code}: sellerPressureProfile.whyItMatters は配列`);
  assert(Array.isArray(spp.evidenceNeeded), `候補 ${c.code}: sellerPressureProfile.evidenceNeeded は配列`);
  // remainingOverhang high かつ notificationEligible true は禁止
  if (spp.remainingOverhang === "high") {
    assert(
      c.notificationEligible !== true,
      `候補 ${c.code}: remainingOverhang=high の場合 notificationEligible=true は禁止`
    );
  }
  // themeCompanyFitReview の検証
  const fit = c.themeCompanyFitReview as Record<string, unknown> | undefined;
  assert(fit !== undefined && typeof fit === "object", `候補 ${c.code}: themeCompanyFitReview が必要`);
  assert(ALLOWED_THEME_WAS_RIGHT.has(fit.themeWasRight as string), `候補 ${c.code}: 不正な themeWasRight: ${fit.themeWasRight}`);
  assert(ALLOWED_SELECTED_COMPANY_FIT.has(fit.selectedCompanyFit as string), `候補 ${c.code}: 不正な selectedCompanyFit: ${fit.selectedCompanyFit}`);
  assert(Array.isArray(fit.whyThemeMayBeRight), `候補 ${c.code}: whyThemeMayBeRight は配列`);
  assert(Array.isArray(fit.whyCompanyMayBeWrong), `候補 ${c.code}: whyCompanyMayBeWrong は配列`);
  assert(Array.isArray(fit.betterCompanyCandidates), `候補 ${c.code}: betterCompanyCandidates は配列`);
  for (const b of fit.betterCompanyCandidates as Array<Record<string, unknown>>) {
    assert(ALLOWED_BETTER_COMPANY_RELATION.has(b.relation as string), `候補 ${c.code}: 不正な betterCompany.relation: ${b.relation}`);
  }
  // selectedCompanyFit weak/wrong_company かつ notificationEligible true は禁止
  if (fit.selectedCompanyFit === "weak" || fit.selectedCompanyFit === "wrong_company") {
    assert(c.notificationEligible !== true,
      `候補 ${c.code}: selectedCompanyFit=${fit.selectedCompanyFit} の場合 notificationEligible=true は禁止`);
  }
  // themeWasRight wrong かつ notificationEligible true は禁止
  if (fit.themeWasRight === "wrong") {
    assert(c.notificationEligible !== true,
      `候補 ${c.code}: themeWasRight=wrong の場合 notificationEligible=true は禁止`);
  }
  // themeWasRight too_early かつ chanceLevel high は notificationEligible false
  if (fit.themeWasRight === "too_early" && c.chanceLevel === "high") {
    assert(c.notificationEligible !== true,
      `候補 ${c.code}: themeWasRight=too_early かつ chanceLevel=high は notificationEligible=false が必要`);
  }
}

// listingInfo に上場日/予定日/ロックアップ/初回決算 を持てる構造があるか
const candidateWithListing = (reportData.candidates as Array<Record<string, unknown>>).find(
  c => isObject(c.listingInfo)
);
assert(candidateWithListing, "listingInfo を持つ candidate が1件以上必要です");
{
  const li = (candidateWithListing as { listingInfo: Record<string, unknown> }).listingInfo;
  assert("listedAt" in li, "listingInfo.listedAt を持てること");
  assert("plannedListingAt" in li, "listingInfo.plannedListingAt を持てること");
  assert("lockupExpiryAt" in li, "listingInfo.lockupExpiryAt を持てること");
  assert("firstEarningsAt" in li, "listingInfo.firstEarningsAt を持てること");
  assert(ALLOWED_CONFIDENCE.has(li.confidence as string), `listingInfo.confidence の値: ${li.confidence}`);
}

// topChanceList の whyNow / whyNotNow / sellerPressureSummary
for (const item of reportData.topChanceList as Array<Record<string, unknown>>) {
  assert(Array.isArray(item.whyNow), `topChanceList ${item.code}: whyNow は配列`);
  assert(Array.isArray(item.whyNotNow), `topChanceList ${item.code}: whyNotNow は配列`);
  if (item.sellerPressureSummary !== undefined && item.sellerPressureSummary !== null) {
    const sps = item.sellerPressureSummary as Record<string, unknown>;
    assert(typeof sps.sellerType === "string", `topChanceList ${item.code}: sellerPressureSummary.sellerType は string`);
    assert(ALLOWED_REMAINING_OVERHANG.has(sps.remainingOverhang as string), `topChanceList ${item.code}: 不正な remainingOverhang: ${sps.remainingOverhang}`);
  }
  if (item.themeCompanyFitSummary !== undefined && item.themeCompanyFitSummary !== null) {
    const tfs = item.themeCompanyFitSummary as Record<string, unknown>;
    assert(typeof tfs.themeLabel === "string", `topChanceList ${item.code}: themeCompanyFitSummary.themeLabel は string`);
    assert(ALLOWED_SELECTED_COMPANY_FIT.has(tfs.selectedCompanyFit as string), `topChanceList ${item.code}: 不正な selectedCompanyFit: ${tfs.selectedCompanyFit}`);
    assert(Array.isArray(tfs.betterCompanyCodes), `topChanceList ${item.code}: betterCompanyCodes は配列`);
  }
}

// 4) reference events に SpaceX / OpenAI / Anthropic / Starlink を持てる構造
const refText = JSON.stringify(reportData.referenceEvents);
for (const kw of ["SpaceX", "OpenAI", "Anthropic", "Starlink"]) {
  assert(refText.includes(kw), `referenceEvents に ${kw} を含む必要があります`);
}
for (const ev of reportData.referenceEvents as Array<Record<string, unknown>>) {
  assert(ALLOWED_CONFIDENCE.has(ev.confidence as string), `referenceEvent.confidence: ${ev.confidence}`);
  assert(typeof ev.eventType === "string", "referenceEvent.eventType は string");
}

// 5) 禁止文言が含まれない
const text = JSON.stringify(reportData) + "\n" + (existsSync("reports/special_situation_watch_latest.md") ? readFileSync("reports/special_situation_watch_latest.md", "utf-8") : "");
for (const forbidden of [
  "買うべき",
  "売るべき",
  "必ず上がる",
  "確実に上がる",
  "推奨銘柄",
  "買い推奨銘柄",
]) {
  assert(!text.includes(forbidden), `禁止文言 ${forbidden} を含めない`);
}

// 6) alpha-pon-data.json に specialSituationWatch が入る
const uiData = readJson("apps/web/public/generated/alpha-pon-data.json");
if (uiData !== null) {
  assert(isObject(uiData), "alpha-pon-data.json は object");
  const sw = (uiData as Record<string, unknown>).specialSituationWatch;
  if (sw !== undefined && sw !== null) {
    assert(isObject(sw), "specialSituationWatch は object");
    assert(Array.isArray((sw as Record<string, unknown>).candidates), "specialSituationWatch.candidates は配列");
    assert(Array.isArray((sw as Record<string, unknown>).topChanceList), "specialSituationWatch.topChanceList は配列");
    assert(Array.isArray((sw as Record<string, unknown>).patterns), "specialSituationWatch.patterns は配列");
  }
}

console.log("special-situation-watch.test.ts passed");
