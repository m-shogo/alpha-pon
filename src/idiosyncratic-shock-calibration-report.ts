// 国/地域別キャリブレーションの昇格準備レポート。
// ネットワークは使わず、既存outcome + historical caseから「どの階層まで独立可能か」を可視化する。
// Local calibrationの正本は、非価格hard gate confirmed_pass後のFirst Eligible Signal後benchmark-relative outcome。
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
    "> Local Opportunityの検証は、checkpoint時点の非価格hard gateがconfirmed_passで、かつFirst Eligible Signalが成立したケースだけを使います。checkpoint後リターンは診断用です。",
    "> eligibility unknownはno-tradeではありません。confirmed_pass後に価格signalが出なかったケースだけがtrue no-tradeです。",
    "> 国・地域差はsignal outcomeが十分に貯まり、時系列holdoutで検証できた階層だけLocal Opportunityの閾値/重みへ昇格します。",
    "> 母数不足またはregistry未登録では12点を変更せず、親モデル/globalへ縮退します。",
    "",
    `- global default threshold: ${GLOBAL_DEFAULT_SHOCK_THRESHOLD}`,
    `- validated local registry entries: ${payload.validatedRegistryCount}`,
    `- registry benchmark metric: signalBenchmarkRelative3m`,
    `- minimum country cases: ${MIN_COUNTRY_CASES}`,
    `- minimum country-category cases: ${MIN_COUNTRY_CATEGORY_CASES}`,
    `- minimum jurisdiction-group cases: ${MIN_GROUP_CASES}`,
    `- minimum train/validation: ${MIN_TRAIN_CASES}/${MIN_VALIDATION_CASES}`,
    `- historical cases: ${payload.historicalCaseCount}`,
    `- quantitative outcome records: ${payload.outcomeRecordCount}`,
    `- non-price eligibility pass/block/unknown: ${payload.eligibilityPassCount}/${payload.eligibilityBlockCount}/${payload.eligibilityUnknownCount}`,
    `- records with First Eligible Signal: ${payload.signalObservationCount}`,
    `- usable signal-based 3m benchmark-relative observations: ${payload.usableObservationCount}`,
    `- true no-trade after confirmed pass: ${payload.noTradeCount}`,
    "",
    "## 国別 readiness",
    "",
    "| country | market | level | status | usable signal 3m | country n | group n | train | validation | threshold | source | registry |",
    "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|",
  ];

  for (const row of payload.countries) {
    const r = row.readiness;
    lines.push(`| ${r.country ?? "-"} | ${r.market ?? "-"} | ${r.modelLevel} | ${r.status} | ${r.usableOutcomeCases} | ${r.countryCases} | ${r.groupCases} | ${r.trainCases} | ${r.validationCases} | ${r.effectiveThreshold} | ${r.effectiveThresholdSource} | ${row.registryEntry?.id ?? "-"} |`);
  }

  lines.push("", "## 国×カテゴリ readiness（usable signal outcomeが存在する組合せのみ）", "");
  if (payload.countryCategories.length === 0) lines.push("- usable First Eligible Signal outcome未蓄積", "");
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
  lines.push("2. decisionCheckpoint時点の非価格hard gateを一次情報でpass/blockまで確定する。unknownは戦略calibrationへ入れない。");
  lines.push("3. confirmed_passケースだけ、未来を見ずにFirst Eligible Signalを再現する。");
  lines.push("4. signal後3か月benchmark相対outcome (`signalBenchmarkRelative3m`) が無い事例はlocal calibration母数に入れない。");
  lines.push("5. confirmed_passだがsignalなしだけをtrue no-tradeとして保存する。unknownをno-tradeにしない。");
  lines.push("6. country-category → country → jurisdiction-group → global の順で、時系列holdoutまで満たす最も深い階層を使う。");
  lines.push("7. trainで閾値候補を作っても、そのまま本番へ反映しない。後ろのvalidation期間で確認する。");
  lines.push("8. validationを通した結果を `config/idiosyncratic-shock-calibration.yml` に証跡付きで登録して初めてlocal threshold/weightを有効化する。");
  lines.push("9. registryが空・不一致・古い階層なら必ずglobal default 12点へ戻す。");
  lines.push("10. outcomeの良し悪しを過去時点の20点scoreへ書き戻さない。");
  return lines.join("\n");
}

function buildPayload(date: string) {
  const historical = loadHistoricalShockCases();
  const records = loadOutcomeRecords();
  const observations = enrichShockCalibrationObservations(records, historical);
  const calibrationConfig = loadShockCalibrationConfig();
  const eligibilityPassCount = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass").length;
  const eligibilityBlockCount = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_block").length;
  const eligibilityUnknownCount = records.length - eligibilityPassCount - eligibilityBlockCount;
  const signalObservationCount = observations.filter(row => Boolean(row.signalDate)).length;
  const usableObservationCount = observations.filter(row => Boolean(row.signalDate) && row.benchmarkRelative3m != null && Number.isFinite(row.benchmarkRelative3m)).length;
  const noTradeCount = Math.max(0, eligibilityPassCount - signalObservationCount);

  const countryMarket = new Map<string, ShockMarket>();
  for (const item of historical) {
    const country = item.country.trim().toUpperCase();
    if (!country) continue;
    countryMarket.set(country, inferShockMarket({ country, ticker: item.ticker }));
  }
  countryMarket.set("JP", "JP");
  countryMarket.set("US", "US");

  const countries: ResolvedRow[] = [...countryMarket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, market]) => resolveShockCalibration(calibrationConfig, { country, market, observations }));

  const countryCategories: ResolvedRow[] = [...new Set(observations
    .filter(row => Boolean(row.signalDate) && row.benchmarkRelative3m != null)
    .map(row => `${row.country ?? "?"}|${row.market}|${row.category}`))]
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
    eligibilityPassCount,
    eligibilityBlockCount,
    eligibilityUnknownCount,
    signalObservationCount,
    usableObservationCount,
    noTradeCount,
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
  console.log(`shock calibration readiness: historical=${payload.historicalCaseCount} outcomes=${payload.outcomeRecordCount} eligPass=${payload.eligibilityPassCount} eligBlock=${payload.eligibilityBlockCount} eligUnknown=${payload.eligibilityUnknownCount} signals=${payload.signalObservationCount} usableSignal3m=${payload.usableObservationCount} trueNoTrade=${payload.noTradeCount} registry=${payload.validatedRegistryCount}`);
  for (const row of payload.countries.filter(row => row.readiness.country === "JP" || row.readiness.country === "US")) {
    const r = row.readiness;
    console.log(`  ${r.country}: ${r.modelLevel}/${r.status} n=${r.countryCases} threshold=${r.effectiveThreshold} source=${r.effectiveThresholdSource} registry=${row.registryEntry?.id ?? "-"}`);
  }
}

main();
