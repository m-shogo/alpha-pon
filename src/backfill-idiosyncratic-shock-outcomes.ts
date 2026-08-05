// 企業固有ショック過去事例の定量 outcome backfill。
// JPはJ-Quants + TOPIX、USはTwelve Data + S&P 500 proxy。
// production signalと、score threshold自体を検証するshadow calibration signalを分離して保存する。
//
// pnpm backfill:shock-outcomes          # dry-run
// pnpm backfill:shock-outcomes --write  # data/idiosyncratic_shock_outcomes.json を更新
//
// scoreは当時checkpointの情報、returnはその後の観測値。未来情報をscoreへ逆流させない。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import { fetchTwelveDataDailyQuotes, isTwelveDataConfigured } from "./fetcher/twelve-data.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
  resolveHistoricalThresholdCalibrationEligibility,
  type HistoricalShockCaseContext,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";
import {
  SHOCK_OUTCOME_DATASET_VERSION,
  SHOCK_OUTCOME_METHODOLOGY,
  assertShockOutcomeDatasetContract,
} from "./idiosyncratic-shock-outcome-contract.js";
import { isHistoricalReactionAnchorReplayReady } from "./idiosyncratic-shock-reaction-anchor.js";
import {
  assertShockResearchSnapshot,
  buildShockResearchSnapshot,
} from "./idiosyncratic-shock-research-snapshot-contract.js";
import {
  buildShockHistoricalOutcome,
  calibrateShockThresholds,
  outcomeFetchRange,
  outcomeFetchRangeIso,
  type HistoricalReactionAnchorStatus,
  type ShockCalibrationBucket,
  type ShockHistoricalOutcomeRecord,
  type ShockOutcomeQuote,
} from "./idiosyncratic-shock-outcomes.js";

const TOPIX_ETF_CODE = process.env.MARKET_BENCHMARK_CODE ?? "1306";
const US_BENCHMARK_SYMBOL = process.env.US_MARKET_BENCHMARK_SYMBOL ?? "SPY";
const OUTPUT_PATH = "data/idiosyncratic_shock_outcomes.json";

type ProviderStatus = {
  market: ShockMarket;
  provider: string;
  configured: boolean;
  benchmark: string;
  eligibleCases: number;
};

type CalibrationByMarket = Partial<Record<ShockMarket, ShockCalibrationBucket[]>>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function f(value: number | null): string {
  return value == null ? "-" : value.toFixed(2);
}

function fp(value: number | null | undefined): string {
  return value == null ? "-" : `${value.toFixed(2)}%`;
}

function resolveReactionAnchorStatus(context?: HistoricalShockCaseContext | null): HistoricalReactionAnchorStatus {
  return isHistoricalReactionAnchorReplayReady(context) ? "verified" : "unverified";
}

function marketCalibration(records: ShockHistoricalOutcomeRecord[]): CalibrationByMarket {
  const result: CalibrationByMarket = {};
  const markets = [...new Set(records.map(row => row.market))].sort();
  for (const market of markets) {
    result[market] = calibrateShockThresholds(records.filter(row => row.market === market));
  }
  return result;
}

function renderCalibration(lines: string[], title: string, records: ShockHistoricalOutcomeRecord[]): void {
  lines.push(`## ${title}`, "");
  lines.push("| bucket | shadow eligible | shadow signals | signal rate | n1m | avg1m | median1m | +rate1m | benchmark相対1m | n3m | avg3m | +rate3m | benchmark相対3m | n1y | avg1y | +rate1y | benchmark相対1y |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of calibrateShockThresholds(records)) {
    lines.push(`| ${row.bucket} | ${row.eligibleCases} | ${row.cases} | ${fp(row.signalRate)} | ${row.n1m} | ${f(row.avgReturn1m)} | ${f(row.medianReturn1m)} | ${fp(row.positiveRate1m)} | ${f(row.avgBenchmarkRelative1m)} | ${row.n3m} | ${f(row.avgReturn3m)} | ${fp(row.positiveRate3m)} | ${f(row.avgBenchmarkRelative3m)} | ${row.n1y} | ${f(row.avgReturn1y)} | ${fp(row.positiveRate1y)} | ${f(row.avgBenchmarkRelative1y)} |`);
  }
  lines.push("");
}

function renderMarkdown(
  date: string,
  records: ShockHistoricalOutcomeRecord[],
  providerStatus: ProviderStatus[],
  failures: string[],
): string {
  const productionPass = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
  const productionBlock = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_block");
  const productionUnknown = records.filter(row => row.strategyEligibilityAtCheckpoint === "unknown");
  const calibrationPass = records.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass");
  const calibrationBlock = records.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_block");
  const calibrationUnknown = records.filter(row => (row.thresholdCalibrationEligibilityAtCheckpoint ?? "unknown") === "unknown");
  const productionAnchored = productionPass.filter(row => row.reactionAnchorStatus === "verified");
  const productionSignals = productionAnchored.filter(row => Boolean(row.firstEligibleSignalDate));
  const productionNoTrade = productionAnchored.length - productionSignals.length;
  const calibrationAnchored = calibrationPass.filter(row => row.reactionAnchorStatus === "verified");
  const calibrationSignals = calibrationAnchored.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  const calibrationNoTrade = calibrationAnchored.length - calibrationSignals.length;
  const belowThresholdControls = calibrationAnchored.filter(row => row.score < 12);
  const belowThresholdSignals = belowThresholdControls.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  const calibrationSignalRate = calibrationAnchored.length === 0 ? null : (calibrationSignals.length / calibrationAnchored.length) * 100;
  const belowThresholdSignalRate = belowThresholdControls.length === 0 ? null : (belowThresholdSignals.length / belowThresholdControls.length) * 100;

  const lines = [
    "# 企業固有ショック 定量outcome / 閾値検証",
    "",
    `生成日: ${date}`,
    "",
    "> productionは現行score>=12を含む本番parity。threshold calibrationはscore gateだけを外したshadow replay。",
    "> return統計の分母はsignal発生ケースだけ。no-signalを0%リターンへ変換せず、eligible全体に対するsignal率を別表示します。",
    "",
    `- price outcome records: ${records.length}`,
    `- production eligibility pass/block/unknown: ${productionPass.length}/${productionBlock.length}/${productionUnknown.length}`,
    `- threshold calibration eligibility pass/block/unknown: ${calibrationPass.length}/${calibrationBlock.length}/${calibrationUnknown.length}`,
    `- production anchored/signals/true-no-trade: ${productionAnchored.length}/${productionSignals.length}/${productionNoTrade}`,
    `- calibration anchored/signals/no-signal/signal-rate: ${calibrationAnchored.length}/${calibrationSignals.length}/${calibrationNoTrade}/${fp(calibrationSignalRate)}`,
    `- below-threshold shadow eligible/signals/signal-rate: ${belowThresholdControls.length}/${belowThresholdSignals.length}/${fp(belowThresholdSignalRate)}`,
    `- failures/skips: ${failures.length}`,
    "",
    "## provider readiness",
    "",
    "| market | provider | configured | benchmark | historical ticker cases |",
    "|---|---|---|---|---:|",
  ];
  for (const row of providerStatus) {
    lines.push(`| ${row.market} | ${row.provider} | ${row.configured ? "yes" : "no"} | ${row.benchmark} | ${row.eligibleCases} |`);
  }
  lines.push("");

  renderCalibration(lines, "全市場 threshold calibration（shadow signal）", records);
  for (const market of [...new Set(records.map(row => row.market))].sort()) {
    renderCalibration(lines, `${market} threshold calibration（shadow signal）`, records.filter(row => row.market === market));
  }

  lines.push("## ケース", "");
  for (const row of [...records].sort((a, b) => b.checkpoint.localeCompare(a.checkpoint))) {
    lines.push(`### ${row.market} ${row.code} ${row.company} (${row.score}/20)`);
    lines.push(`- benchmark: ${row.benchmark}`);
    lines.push(`- event/reaction/checkpoint: ${row.eventDate} / ${row.reactionStartDate} / ${row.checkpoint}`);
    lines.push(`- reaction anchor: ${row.reactionAnchorStatus} / trading-day-observed=${row.reactionAnchorTradingDayObserved}`);
    lines.push(`- production eligibility: ${row.strategyEligibilityAtCheckpoint}`);
    lines.push(`- threshold calibration eligibility: ${row.thresholdCalibrationEligibilityAtCheckpoint ?? "unknown"}`);
    lines.push(`- event shock drawdown: ${fp(row.shockDrawdownPct)} (${row.preEventDate ?? "-"} → low ${row.shockLowDate ?? "-"})`);
    lines.push(`- checkpoint return: 1w ${fp(row.return1w)} / 1m ${fp(row.return1m)} / 3m ${fp(row.return3m)} / 1y ${fp(row.return1y)}`);

    if (row.firstEligibleSignalDate) {
      lines.push(`- production signal: ${row.firstEligibleSignalDate} @ ${row.firstEligibleSignalPrice ?? "-"} / shock ${fp(row.signalShockDrawdownPct)} / relative ${fp(row.signalRelativeShockDrawdownPct)}`);
      lines.push(`- production signal return: 1m ${fp(row.signalReturn1m)} / 3m ${fp(row.signalReturn3m)} / benchmark relative 3m ${fp(row.signalBenchmarkRelative3m)}`);
    } else if (row.strategyEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified") {
      lines.push("- production signal: none (true no-trade)");
    } else {
      lines.push("- production signal: not evaluated");
    }

    if (row.calibrationFirstEligibleSignalDate) {
      lines.push(`- calibration shadow signal: ${row.calibrationFirstEligibleSignalDate} @ ${row.calibrationFirstEligibleSignalPrice ?? "-"} / shock ${fp(row.calibrationSignalShockDrawdownPct)} / relative ${fp(row.calibrationSignalRelativeShockDrawdownPct)}`);
      lines.push(`- calibration shadow return: 1m ${fp(row.calibrationSignalReturn1m)} / 3m ${fp(row.calibrationSignalReturn3m)} / benchmark relative 3m ${fp(row.calibrationSignalBenchmarkRelative3m)}`);
    } else if (row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified") {
      lines.push("- calibration shadow signal: none (price gates never completed; counted in signal-rate denominator only)");
    } else {
      lines.push("- calibration shadow signal: not evaluated");
    }
    lines.push("");
  }

  lines.push("## 解釈ルール", "");
  lines.push("- production signalは現行threshold=12を含む。本番parity確認に使う。");
  lines.push("- threshold/weights学習はcalibration shadow signalを使う。score thresholdだけを外し、その他hard gateは本番と共有する。");
  lines.push("- score<12のproduction BLOCKを自動でshadow PASSへ変換しない。一次情報でcalibrationEligibilityAtCheckpointを明示確認したケースだけ比較群へ入れる。");
  lines.push("- eligibility unknown / reaction-anchor not replay-readyをsignal率の分母にも入れない。");
  lines.push("- reaction anchorはevidenceだけでなくstock/benchmark両方の同日価格観測を要求する。provider欠損や休日誤登録はunverifiedへ降格する。");
  lines.push("- shadow PASS + replay-readyだがsignalなしはreturn=0にせず、signal率の分母へだけ残す。");
  lines.push("- `score_ge_12` と `score_lt_12` をsignal率、signal後3m benchmark-relative、中央値、プラス率で比較する。");
  lines.push("- JPとUSは市場構造が違うため、全市場混合値だけで閾値を変更しない。");
  lines.push("- 標本が小さい間はthreshold=12を変更しない。");
  if (failures.length > 0) lines.push("", "## failures / skips", "", ...failures.map(value => `- ${value}`));
  return lines.join("\n");
}

async function main(): Promise<void> {
  const doWrite = process.argv.includes("--write");
  const date = todayJst();
  const allCases = loadHistoricalShockCases().filter(item => Boolean(item.ticker));
  const contextById = loadHistoricalShockCaseContext();
  const researchSnapshot = buildShockResearchSnapshot(allCases, contextById, date);
  assertShockResearchSnapshot(researchSnapshot);
  const jpCases = allCases.filter(item => inferShockMarket({ country: item.country, ticker: item.ticker }) === "JP" && /^\d{4}$/.test(item.ticker ?? ""));
  const usCases = allCases.filter(item => inferShockMarket({ country: item.country, ticker: item.ticker }) === "US" && Boolean(item.ticker));
  const jqConfigured = isJQuantsConfigured();
  const twelveConfigured = isTwelveDataConfigured();

  const providerStatus: ProviderStatus[] = [
    { market: "JP", provider: "jquants", configured: jqConfigured, benchmark: `TOPIX proxy ${TOPIX_ETF_CODE}`, eligibleCases: jpCases.length },
    { market: "US", provider: "twelve_data", configured: twelveConfigured, benchmark: `S&P 500 proxy ${US_BENCHMARK_SYMBOL}`, eligibleCases: usCases.length },
  ];

  console.log(`[backfill:shock-outcomes] mode=${doWrite ? "WRITE" : "DRY-RUN"} JP=${jpCases.length} US=${usCases.length}`);
  console.log(`  researchSnapshot=${researchSnapshot.aggregateSha256}`);
  console.log(`  providers: JQuants=${jqConfigured} TwelveData=${twelveConfigured}`);

  const records: ShockHistoricalOutcomeRecord[] = [];
  const failures: string[] = [];

  for (const item of jpCases) {
    if (!jqConfigured) {
      failures.push(`${item.id}: JP provider not configured`);
      continue;
    }
    const code = item.ticker!;
    const range = outcomeFetchRange(item, date);
    try {
      console.log(`  [JP] fetch ${code} ${item.company}: ${range.from}-${range.to}`);
      const quotes = await fetchDailyQuotes(code, range.from, range.to);
      const benchmarkQuotes = await fetchDailyQuotes(TOPIX_ETF_CODE, range.from, range.to);
      const context = contextById.get(item.id);
      const reactionStartDate = context?.priceReactionStartDate ?? item.eventDate;
      const reactionAnchorStatus = resolveReactionAnchorStatus(context);
      const strategyEligibilityAtCheckpoint = resolveHistoricalStrategyEligibility(item, context);
      const thresholdCalibrationEligibilityAtCheckpoint = resolveHistoricalThresholdCalibrationEligibility(item, context);
      const record = buildShockHistoricalOutcome(item, quotes, benchmarkQuotes, date, {
        market: "JP",
        benchmarkLabel: "TOPIX",
        reactionStartDate,
        reactionAnchorStatus,
        strategyEligibilityAtCheckpoint,
        thresholdCalibrationEligibilityAtCheckpoint,
      });
      if (record) records.push(record);
      else failures.push(`${item.id}: checkpoint price missing`);
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(350);
  }

  for (const item of usCases) {
    if (!twelveConfigured) {
      failures.push(`${item.id}: US provider not configured`);
      continue;
    }
    const symbol = item.ticker!;
    const range = outcomeFetchRangeIso(item, date);
    try {
      console.log(`  [US] fetch ${symbol} ${item.company}: ${range.from}-${range.to}`);
      const stock = await fetchTwelveDataDailyQuotes(symbol, range.from, range.to);
      const benchmark = await fetchTwelveDataDailyQuotes(US_BENCHMARK_SYMBOL, range.from, range.to);
      const context = contextById.get(item.id);
      const reactionStartDate = context?.priceReactionStartDate ?? item.eventDate;
      const reactionAnchorStatus = resolveReactionAnchorStatus(context);
      const strategyEligibilityAtCheckpoint = resolveHistoricalStrategyEligibility(item, context);
      const thresholdCalibrationEligibilityAtCheckpoint = resolveHistoricalThresholdCalibrationEligibility(item, context);
      const record = buildShockHistoricalOutcome(
        item,
        stock as ShockOutcomeQuote[],
        benchmark as ShockOutcomeQuote[],
        date,
        {
          market: "US",
          benchmarkLabel: "S&P 500",
          reactionStartDate,
          reactionAnchorStatus,
          strategyEligibilityAtCheckpoint,
          thresholdCalibrationEligibilityAtCheckpoint,
        },
      );
      if (record) records.push(record);
      else failures.push(`${item.id}: checkpoint price missing`);
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const calibration = calibrateShockThresholds(records);
  const calibrationByMarket = marketCalibration(records);
  const productionPass = records.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
  const productionSignals = productionPass.filter(row => row.reactionAnchorStatus === "verified" && Boolean(row.firstEligibleSignalDate));
  const calibrationPass = records.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass");
  const calibrationAnchored = calibrationPass.filter(row => row.reactionAnchorStatus === "verified");
  const calibrationSignals = calibrationAnchored.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  const belowThresholdAnchored = calibrationAnchored.filter(row => row.score < 12);
  const belowThresholdSignals = belowThresholdAnchored.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  console.log(`records=${records.length} productionPass=${productionPass.length} productionSignals=${productionSignals.length} calibrationPass=${calibrationPass.length} calibrationEligible=${calibrationAnchored.length} calibrationSignals=${calibrationSignals.length} calibrationSignalRate=${calibrationAnchored.length ? ((calibrationSignals.length / calibrationAnchored.length) * 100).toFixed(1) : "-"}% belowThreshold=${belowThresholdAnchored.length}/${belowThresholdSignals.length} failures/skips=${failures.length}`);
  for (const market of Object.keys(calibrationByMarket) as ShockMarket[]) {
    const marketRows = calibrationByMarket[market] ?? [];
    const ge12 = marketRows.find(row => row.bucket === "score_ge_12");
    const lt12 = marketRows.find(row => row.bucket === "score_lt_12");
    console.log(`  ${market}: shadow>=12 eligible/signals/rate=${ge12?.eligibleCases ?? 0}/${ge12?.cases ?? 0}/${ge12?.signalRate ?? "-"}% rel3m=${ge12?.avgBenchmarkRelative3m ?? "-"} | shadow<12 eligible/signals/rate=${lt12?.eligibleCases ?? 0}/${lt12?.cases ?? 0}/${lt12?.signalRate ?? "-"}% rel3m=${lt12?.avgBenchmarkRelative3m ?? "-"}`);
  }
  if (failures.length) failures.forEach(value => console.log(`  [warn] ${value}`));

  if (!doWrite) {
    console.log("dry-run: ファイルは変更していません。--write で保存します。");
    return;
  }
  if (records.length === 0) {
    console.error("write中止: price outcome recordが0件です。provider設定を確認してください。");
    process.exitCode = 1;
    return;
  }

  mkdirSync("data", { recursive: true });
  mkdirSync("reports", { recursive: true });
  const payload = {
    version: SHOCK_OUTCOME_DATASET_VERSION,
    generatedAt: date,
    researchSnapshotSha256: researchSnapshot.aggregateSha256,
    providers: providerStatus,
    methodology: SHOCK_OUTCOME_METHODOLOGY,
    records,
    calibration,
    calibrationByMarket,
    failures,
  };
  assertShockOutcomeDatasetContract(payload);
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_research_snapshot_latest.json", JSON.stringify(researchSnapshot, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_outcomes_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_outcomes_latest.md", renderMarkdown(date, records, providerStatus, failures), "utf-8");
  console.log(`saved: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
