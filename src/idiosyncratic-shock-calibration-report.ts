// 国/地域別キャリブレーションの昇格準備レポート。
// production通知とthreshold=12検証用shadow calibrationを分離する。
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
import { calibrateShockThresholds, type ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";
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

function pct(value: number | null): string {
  return value == null ? "-" : `${value.toFixed(1)}%`;
}

function render(date: string, payload: ReturnType<typeof buildPayload>): string {
  const ge12 = payload.thresholdBuckets.find(row => row.bucket === "score_ge_12");
  const lt12 = payload.thresholdBuckets.find(row => row.bucket === "score_lt_12");
  const lines = [
    "# 企業固有ショック 国/地域キャリブレーション readiness",
    "",
    `生成日: ${date}`,
    "",
    "> Global Structural Score（20点）は世界共通の事実評価として固定します。",
    "> productionは現行threshold=12を含む本番parity。threshold calibrationはscore gateだけを外したshadow signalで12点そのものを検証します。",
    "> shadow PASSは低scoreを自動採用する仕組みではありません。score以外のhard gateを一次情報で再検証し、明示したケースだけ比較群へ入れます。",
    "> no-signalを0%リターンへ変換しません。return統計とsignal発生率を別々に評価します。",
    "> 時系列holdoutとvalidated registryを満たすまではthreshold=12を変更しません。",
    "",
    `- global default threshold: ${GLOBAL_DEFAULT_SHOCK_THRESHOLD}`,
    `- validated local registry entries: ${payload.validatedRegistryCount}`,
    `- registry benchmark metric: calibrationSignalBenchmarkRelative3m`,
    `- minimum country cases: ${MIN_COUNTRY_CASES}`,
    `- minimum country-category cases: ${MIN_COUNTRY_CATEGORY_CASES}`,
    `- minimum jurisdiction-group cases: ${MIN_GROUP_CASES}`,
    `- minimum train/validation: ${MIN_TRAIN_CASES}/${MIN_VALIDATION_CASES}`,
    `- historical cases: ${payload.historicalCaseCount}`,
    `- quantitative outcome records: ${payload.outcomeRecordCount}`,
    `- production eligibility pass/block/unknown: ${payload.production.pass}/${payload.production.block}/${payload.production.unknown}`,
    `- production signals/true-no-trade: ${payload.production.signals}/${payload.production.trueNoTrade}`,
    `- threshold calibration eligibility pass/block/unknown: ${payload.calibration.pass}/${payload.calibration.block}/${payload.calibration.unknown}`,
    `- shadow signals/no-signal: ${payload.calibration.signals}/${payload.calibration.noSignal}`,
    `- usable shadow 3m benchmark-relative observations: ${payload.calibration.usable3m}`,
    `- below-threshold shadow eligible/signals: ${lt12?.eligibleCases ?? 0}/${lt12?.cases ?? 0}`,
    `- >=12 shadow eligible/signals: ${ge12?.eligibleCases ?? 0}/${ge12?.cases ?? 0}`,
    "",
    "## Threshold comparison snapshot",
    "",
    "| bucket | eligible | signals | signal rate | avg 1m | +rate 1m | avg benchmark-rel 3m | +rate 3m |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const row of payload.thresholdBuckets.filter(row => ["score_ge_12", "score_lt_12", "score_16_20", "score_12_15", "score_8_11", "score_0_7"].includes(row.bucket))) {
    lines.push(`| ${row.bucket} | ${row.eligibleCases} | ${row.cases} | ${pct(row.signalRate)} | ${row.avgReturn1m ?? "-"} | ${pct(row.positiveRate1m)} | ${row.avgBenchmarkRelative3m ?? "-"} | ${pct(row.positiveRate3m)} |`);
  }

  lines.push("", "## 国別 readiness", "", "| country | market | level | status | usable shadow 3m | country n | group n | train | validation | threshold | source | registry |", "|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|");
  for (const row of payload.countries) {
    const r = row.readiness;
    lines.push(`| ${r.country ?? "-"} | ${r.market ?? "-"} | ${r.modelLevel} | ${r.status} | ${r.usableOutcomeCases} | ${r.countryCases} | ${r.groupCases} | ${r.trainCases} | ${r.validationCases} | ${r.effectiveThreshold} | ${r.effectiveThresholdSource} | ${row.registryEntry?.id ?? "-"} |`);
  }

  lines.push("", "## 国×カテゴリ readiness（usable shadow outcomeが存在する組合せのみ）", "");
  if (payload.countryCategories.length === 0) lines.push("- usable shadow First Eligible Signal outcome未蓄積", "");
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
  lines.push("1. Production通知は現行score>=12を維持する。");
  lines.push("2. Threshold研究だけscore gateを外し、会計・マクロ・調査・規制・confounder・source等は本番と共有する。");
  lines.push("3. score<12を自動shadow PASSにしない。`calibrationEligibilityAtCheckpoint` を一次情報で明示確認する。");
  lines.push("4. production/shadowともreplay-ready reaction anchorが無ければ価格signalを作らない。");
  lines.push("5. shadow signal後3か月benchmark相対 (`calibrationSignalBenchmarkRelative3m`) をlocal calibration正本にする。");
  lines.push("6. no-signalはreturn=0にしない。ただしeligible件数を分母にsignal rateとして保持する。");
  lines.push("7. score>=12とscore<12をsignal rate・3m benchmark-relative・中央値・プラス率で比較する。");
  lines.push("8. country-category → country → jurisdiction-group → global の順で、chronological holdoutを満たす最も深い階層を検証する。");
  lines.push("9. validation済み結果を `config/idiosyncratic-shock-calibration.yml` へ登録して初めてlocal threshold/weightを有効化する。");
  lines.push("10. registryが空・不一致ならglobal default 12へ縮退し、未来outcomeを過去scoreへ書き戻さない。");
  return lines.join("\n");
}

function buildPayload(date: string) {
  const historical = loadHistoricalShockCases();
  const records = loadOutcomeRecords();
  const observations = enrichShockCalibrationObservations(records, historical);
  const calibrationConfig = loadShockCalibrationConfig();
  const productionPass = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
  const productionBlock = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_block");
  const productionUnknown = records.length - productionPass.length - productionBlock.length;
  const productionAnchored = productionPass.filter(row => row.reactionAnchorStatus === "verified");
  const productionSignals = productionAnchored.filter(row => Boolean(row.firstEligibleSignalDate));

  const calibrationPass = records.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass");
  const calibrationBlock = records.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_block");
  const calibrationUnknown = records.length - calibrationPass.length - calibrationBlock.length;
  const calibrationAnchored = calibrationPass.filter(row => row.reactionAnchorStatus === "verified");
  const calibrationSignals = calibrationAnchored.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  const usableObservationCount = observations.filter(row => Boolean(row.signalDate) && row.benchmarkRelative3m != null && Number.isFinite(row.benchmarkRelative3m)).length;
  const thresholdBuckets = calibrateShockThresholds(records);

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
    production: {
      pass: productionPass.length,
      block: productionBlock.length,
      unknown: productionUnknown,
      signals: productionSignals.length,
      trueNoTrade: productionAnchored.length - productionSignals.length,
    },
    calibration: {
      pass: calibrationPass.length,
      block: calibrationBlock.length,
      unknown: calibrationUnknown,
      signals: calibrationSignals.length,
      noSignal: calibrationAnchored.length - calibrationSignals.length,
      usable3m: usableObservationCount,
    },
    thresholdBuckets,
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
  const ge12 = payload.thresholdBuckets.find(row => row.bucket === "score_ge_12");
  const lt12 = payload.thresholdBuckets.find(row => row.bucket === "score_lt_12");
  console.log(`shock calibration readiness: historical=${payload.historicalCaseCount} outcomes=${payload.outcomeRecordCount} production=${payload.production.pass}/${payload.production.block}/${payload.production.unknown} calibration=${payload.calibration.pass}/${payload.calibration.block}/${payload.calibration.unknown} shadowSignals=${payload.calibration.signals} usable3m=${payload.calibration.usable3m} >=12=${ge12?.eligibleCases ?? 0}/${ge12?.cases ?? 0} <12=${lt12?.eligibleCases ?? 0}/${lt12?.cases ?? 0} registry=${payload.validatedRegistryCount}`);
  for (const row of payload.countries.filter(row => row.readiness.country === "JP" || row.readiness.country === "US")) {
    const r = row.readiness;
    console.log(`  ${r.country}: ${r.modelLevel}/${r.status} n=${r.countryCases} threshold=${r.effectiveThreshold} source=${r.effectiveThresholdSource} registry=${row.registryEntry?.id ?? "-"}`);
  }
}

main();
