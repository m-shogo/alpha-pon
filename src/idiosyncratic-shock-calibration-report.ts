// 国/地域別キャリブレーションの昇格準備レポート。
// ネットワークは使わず、既存outcome + historical caseから「どの階層まで独立可能か」を可視化する。
// pnpm report:shock-calibration

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  GLOBAL_DEFAULT_SHOCK_THRESHOLD,
  MIN_COUNTRY_CASES,
  MIN_COUNTRY_CATEGORY_CASES,
  MIN_GROUP_CASES,
  MIN_TRAIN_CASES,
  MIN_VALIDATION_CASES,
  buildShockCalibrationReadiness,
  enrichShockCalibrationObservations,
} from "./idiosyncratic-shock-calibration.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";
import { todayJst } from "./date.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";

type OutcomePayload = { records?: ShockHistoricalOutcomeRecord[] };

function loadOutcomeRecords(): ShockHistoricalOutcomeRecord[] {
  if (!existsSync(OUTCOME_PATH)) return [];
  try {
    const payload = JSON.parse(readFileSync(OUTCOME_PATH, "utf-8")) as OutcomePayload;
    return Array.isArray(payload.records) ? payload.records : [];
  } catch {
    return [];
  }
}

function render(date: string, payload: ReturnType<typeof buildPayload>): string {
  const lines = [
    "# 企業固有ショック 国/地域キャリブレーション readiness",
    "",
    `生成日: ${date}`,
    "",
    "> Global Structural Score（20点）は世界共通の事実評価として固定します。",
    "> 国・地域差はoutcomeが十分に貯まり、時系列holdoutで検証できた階層だけLocal Opportunityの閾値/重みへ昇格します。",
    "> 母数不足では12点を変更せず、親モデルへ縮退します。",
    "",
    `- global default threshold: ${GLOBAL_DEFAULT_SHOCK_THRESHOLD}`,
    `- minimum country cases: ${MIN_COUNTRY_CASES}`,
    `- minimum country-category cases: ${MIN_COUNTRY_CATEGORY_CASES}`,
    `- minimum jurisdiction-group cases: ${MIN_GROUP_CASES}`,
    `- minimum train/validation: ${MIN_TRAIN_CASES}/${MIN_VALIDATION_CASES}`,
    `- historical cases: ${payload.historicalCaseCount}`,
    `- quantitative outcome records: ${payload.outcomeRecordCount}`,
    `- usable 3m benchmark-relative observations: ${payload.usableObservationCount}`,
    "",
    "## 国別 readiness",
    "",
    "| country | market | level | status | usable | country n | group n | train | validation | effective threshold | source |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|",
  ];

  for (const row of payload.countries) {
    lines.push(`| ${row.country ?? "-"} | ${row.market ?? "-"} | ${row.modelLevel} | ${row.status} | ${row.usableOutcomeCases} | ${row.countryCases} | ${row.groupCases} | ${row.trainCases} | ${row.validationCases} | ${row.effectiveThreshold} | ${row.effectiveThresholdSource} |`);
  }

  lines.push("", "## 国×カテゴリ readiness（outcomeが存在する組合せのみ）", "");
  if (payload.countryCategories.length === 0) lines.push("- quantitative outcome未蓄積", "");
  for (const row of payload.countryCategories) {
    lines.push(`### ${row.country ?? "-"} / ${row.category ?? "-"}`);
    lines.push(`- level/status: ${row.modelLevel} / ${row.status}`);
    lines.push(`- n: country-category=${row.countryCategoryCases}, country=${row.countryCases}, group=${row.groupCases}`);
    lines.push(`- train/validation: ${row.trainCases}/${row.validationCases}`);
    lines.push(`- effective threshold: ${row.effectiveThreshold} (${row.effectiveThresholdSource})`);
    if (row.blockers.length) lines.push(`- blockers: ${row.blockers.join(" / ")}`);
    if (row.notes.length) lines.push(`- notes: ${row.notes.join(" / ")}`);
    lines.push("");
  }

  lines.push("## 昇格ルール", "");
  lines.push("1. まずGlobal Structural Scoreを共通で蓄積する。");
  lines.push("2. 3か月benchmark相対outcomeが無い事例はlocal calibration母数に入れない。");
  lines.push("3. country-category → country → jurisdiction-group → global の順で、時系列holdoutまで満たす最も深い階層を使う。");
  lines.push("4. trainで閾値候補を作っても、そのまま本番へ反映しない。後ろのvalidation期間で確認する。");
  lines.push("5. validation前は必ずglobal default 12点を維持する。");
  lines.push("6. outcomeの良し悪しを過去時点の20点scoreへ書き戻さない。");
  lines.push("7. 国別差分が本当に再現する場合だけ、Local Opportunity threshold/weightを独立させる。");
  return lines.join("\n");
}

function buildPayload(date: string) {
  const historical = loadHistoricalShockCases();
  const records = loadOutcomeRecords();
  const observations = enrichShockCalibrationObservations(records, historical);
  const usableObservationCount = observations.filter(row => row.benchmarkRelative3m != null).length;

  const countryMarket = new Map<string, ShockMarket>();
  for (const item of historical) {
    const country = item.country.trim().toUpperCase();
    if (!country) continue;
    countryMarket.set(country, inferShockMarket({ country, ticker: item.ticker }));
  }
  // 最優先市場はデータが0でも常にreadinessへ出す。
  countryMarket.set("JP", "JP");
  countryMarket.set("US", "US");

  const countries = [...countryMarket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, market]) => buildShockCalibrationReadiness({ country, market, observations }));

  const countryCategories = [...new Set(observations.map(row => `${row.country ?? "?"}|${row.market}|${row.category}`))]
    .map(key => {
      const [countryRaw, marketRaw, category] = key.split("|");
      return buildShockCalibrationReadiness({
        country: countryRaw === "?" ? null : countryRaw,
        market: marketRaw as ShockMarket,
        category,
        observations,
      });
    })
    .sort((a, b) => (a.country ?? "").localeCompare(b.country ?? "") || (a.category ?? "").localeCompare(b.category ?? ""));

  return {
    generatedAt: date,
    globalDefaultThreshold: GLOBAL_DEFAULT_SHOCK_THRESHOLD,
    historicalCaseCount: historical.length,
    outcomeRecordCount: records.length,
    usableObservationCount,
    countries,
    countryCategories,
  };
}

function main(): void {
  const date = todayJst();
  const payload = buildPayload(date);
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_calibration_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_calibration_latest.md", render(date, payload), "utf-8");
  console.log(`shock calibration readiness: historical=${payload.historicalCaseCount} outcomes=${payload.outcomeRecordCount} usable3m=${payload.usableObservationCount}`);
  for (const row of payload.countries.filter(row => row.country === "JP" || row.country === "US")) {
    console.log(`  ${row.country}: ${row.modelLevel}/${row.status} n=${row.countryCases} threshold=${row.effectiveThreshold} source=${row.effectiveThresholdSource}`);
  }
}

main();
