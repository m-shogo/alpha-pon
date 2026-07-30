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
  enrichShockCalibrationObservations,
} from "./idiosyncratic-shock-calibration.js";
import {
  loadShockCalibrationConfig,
  resolveShockCalibration,
  type ResolvedShockCalibration,
} from "./idiosyncratic-shock-calibration-config.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";
import { todayJst } from "./date.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";

type OutcomePayload = { records?: ShockHistoricalOutcomeRecord[] };
type ResolvedRow = ResolvedShockCalibration;

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
    "> 母数不足またはregistry未登録では12点を変更せず、親モデル/globalへ縮退します。",
    "",
    `- global default threshold: ${GLOBAL_DEFAULT_SHOCK_THRESHOLD}`,
    `- validated local registry entries: ${payload.validatedRegistryCount}`,
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
    "| country | market | level | status | usable | country n | group n | train | validation | threshold | source | registry |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|",
  ];

  for (const row of payload.countries) {
    const r = row.readiness;
    lines.push(`| ${r.country ?? "-"} | ${r.market ?? "-"} | ${r.modelLevel} | ${r.status} | ${r.usableOutcomeCases} | ${r.countryCases} | ${r.groupCases} | ${r.trainCases} | ${r.validationCases} | ${r.effectiveThreshold} | ${r.effectiveThresholdSource} | ${row.registryEntry?.id ?? "-"} |`);
  }

  lines.push("", "## 国×カテゴリ readiness（outcomeが存在する組合せのみ）", "");
  if (payload.countryCategories.length === 0) lines.push("- quantitative outcome未蓄積", "");
  for (const row of payload.countryCategories) {
    const r = row.readiness;
    lines.push(`### ${r.country ?? "-"} / ${r.category ?? "-"}`);
    lines.push(`- level/status: ${r.modelLevel} / ${r.status}`);
    lines.push(`- n: country-category=${r.countryCategoryCases}, country=${r.countryCases}, group=${r.groupCases}`);
    lines.push(`- train/validation: ${r.trainCases}/${r.validationCases}`);
    lines.push(`- effective threshold: ${r.effectiveThreshold} (${r.effectiveThresholdSource})`);
    lines.push(`- validated registry: ${row.registryEntry?.id ?? "none"}`);
    if (r.blockers.length) lines.push(`- blockers: ${r.blockers.join(" / ")}`);
    if (r.notes.length) lines.push(`- notes: ${r.notes.join(" / ")}`);
    lines.push("");
  }

  lines.push("## 昇格ルール", "");
  lines.push("1. まずGlobal Structural Scoreを共通で蓄積する。");
  lines.push("2. 3か月benchmark相対outcomeが無い事例はlocal calibration母数に入れない。");
  lines.push("3. country-category → country → jurisdiction-group → global の順で、時系列holdoutまで満たす最も深い階層を使う。");
  lines.push("4. trainで閾値候補を作っても、そのまま本番へ反映しない。後ろのvalidation期間で確認する。");
  lines.push("5. validationを通した結果を `config/idiosyncratic-shock-calibration.yml` に証跡付きで登録して初めてlocal thresholdを有効化する。");
  lines.push("6. registryが空・不一致・古い階層なら必ずglobal default 12点へ戻す。");
  lines.push("7. outcomeの良し悪しを過去時点の20点scoreへ書き戻さない。");
  lines.push("8. 国別差分が本当に再現する場合だけ、Local Opportunity threshold/weightを独立させる。");
  return lines.join("\n");
}

function buildPayload(date: string) {
  const historical = loadHistoricalShockCases();
  const records = loadOutcomeRecords();
  const observations = enrichShockCalibrationObservations(records, historical);
  const calibrationConfig = loadShockCalibrationConfig();
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

  const countries: ResolvedRow[] = [...countryMarket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, market]) => resolveShockCalibration(calibrationConfig, { country, market, observations }));

  const countryCategories: ResolvedRow[] = [...new Set(observations.map(row => `${row.country ?? "?"}|${row.market}|${row.category}`))]
    .map(key => {
      const [countryRaw, marketRaw, category] = key.split("|");
      return resolveShockCalibration(calibrationConfig, {
        country: countryRaw === "?" ? null : countryRaw,
        market: marketRaw as ShockMarket,
        category,
        observations,
      });
    })
    .sort((a, b) => (a.readiness.country ?? "").localeCompare(b.readiness.country ?? "") || (a.readiness.category ?? "").localeCompare(b.readiness.category ?? ""));

  return {
    generatedAt: date,
    globalDefaultThreshold: GLOBAL_DEFAULT_SHOCK_THRESHOLD,
    validatedRegistryCount: calibrationConfig.validatedLocalThresholds.length,
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
  console.log(`shock calibration readiness: historical=${payload.historicalCaseCount} outcomes=${payload.outcomeRecordCount} usable3m=${payload.usableObservationCount} registry=${payload.validatedRegistryCount}`);
  for (const row of payload.countries.filter(row => row.readiness.country === "JP" || row.readiness.country === "US")) {
    const r = row.readiness;
    console.log(`  ${r.country}: ${r.modelLevel}/${r.status} n=${r.countryCases} threshold=${r.effectiveThreshold} source=${r.effectiveThresholdSource} registry=${row.registryEntry?.id ?? "-"}`);
  }
}

main();
