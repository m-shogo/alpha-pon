// 企業固有ショック過去事例の定量 outcome backfill。
// JPはJ-Quants + TOPIX、USはTwelve Data + S&P 500 proxyで、decision checkpoint起点の将来returnを測る。
//
// pnpm backfill:shock-outcomes          # dry-run
// pnpm backfill:shock-outcomes --write  # data/idiosyncratic_shock_outcomes.json を更新
//
// scoreは当時checkpointの情報、returnはその後の観測値。未来情報をscoreへ逆流させない。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import { fetchTwelveDataDailyQuotes, isTwelveDataConfigured } from "./fetcher/twelve-data.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";
import {
  buildShockHistoricalOutcome,
  calibrateShockThresholds,
  outcomeFetchRange,
  outcomeFetchRangeIso,
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
  lines.push("| bucket | cases | n1m | avg1m | median1m | +rate1m | benchmark相対1m | n3m | avg3m | +rate3m | benchmark相対3m | n1y | avg1y | +rate1y | benchmark相対1y |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of calibrateShockThresholds(records)) {
    lines.push(`| ${row.bucket} | ${row.cases} | ${row.n1m} | ${f(row.avgReturn1m)} | ${f(row.medianReturn1m)} | ${f(row.positiveRate1m)}% | ${f(row.avgBenchmarkRelative1m)} | ${row.n3m} | ${f(row.avgReturn3m)} | ${f(row.positiveRate3m)}% | ${f(row.avgBenchmarkRelative3m)} | ${row.n1y} | ${f(row.avgReturn1y)} | ${f(row.positiveRate1y)}% | ${f(row.avgBenchmarkRelative1y)} |`);
  }
  lines.push("");
}

function renderMarkdown(
  date: string,
  records: ShockHistoricalOutcomeRecord[],
  providerStatus: ProviderStatus[],
  failures: string[],
): string {
  const lines = [
    "# 企業固有ショック 定量outcome / 閾値検証",
    "",
    `生成日: ${date}`,
    "",
    "> scoreはdecision checkpoint時点の評価。リターンはその後の結果で、scoreには逆流させません。",
    "> 12点は暫定運用閾値です。市場ごとにサンプルが増えるまで自動で『有効』と断定しません。",
    "",
    `- price outcome records: ${records.length}`,
    `- failures/skips: ${failures.length}`,
    "",
    "## provider readiness",
    "",
    "| market | provider | configured | benchmark | eligible historical cases |",
    "|---|---|---|---|---:|",
  ];
  for (const row of providerStatus) {
    lines.push(`| ${row.market} | ${row.provider} | ${row.configured ? "yes" : "no"} | ${row.benchmark} | ${row.eligibleCases} |`);
  }
  lines.push("");

  renderCalibration(lines, "全市場（参考）", records);
  for (const market of [...new Set(records.map(row => row.market))].sort()) {
    renderCalibration(lines, `${market} 市場`, records.filter(row => row.market === market));
  }

  lines.push("## ケース", "");
  for (const row of [...records].sort((a, b) => b.checkpoint.localeCompare(a.checkpoint))) {
    const fp = (value: number | null) => value == null ? "-" : `${value.toFixed(2)}%`;
    lines.push(`### ${row.market} ${row.code} ${row.company} (${row.score}/20)`);
    lines.push(`- benchmark: ${row.benchmark}`);
    lines.push(`- event/checkpoint: ${row.eventDate} / ${row.checkpoint}`);
    lines.push(`- shock drawdown: ${fp(row.shockDrawdownPct)} (${row.preEventDate ?? "-"} → low ${row.shockLowDate ?? "-"})`);
    lines.push(`- return: 1w ${fp(row.return1w)} / 1m ${fp(row.return1m)} / 3m ${fp(row.return3m)} / 1y ${fp(row.return1y)}`);
    lines.push(`- benchmark relative: 1m ${fp(row.benchmarkRelative1m)} / 3m ${fp(row.benchmarkRelative3m)} / 1y ${fp(row.benchmarkRelative1y)}`);
    lines.push("");
  }

  lines.push("## 解釈ルール", "");
  lines.push("- `score_ge_12` が `score_lt_12` を市場ごとに継続的に上回るかを見る。");
  lines.push("- 平均だけでなく中央値・プラス率・現地benchmark相対を併用する。");
  lines.push("- JPとUSは市場構造が違うため、全市場混合値だけで閾値を変えない。");
  lines.push("- nが小さいうちは閾値を自動変更しない。");
  lines.push("- 事件後の買収・アクティビスト・市況変化など交絡は別レビューする。");
  if (failures.length > 0) {
    lines.push("", "## failures / skips", "", ...failures.map(value => `- ${value}`));
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const doWrite = process.argv.includes("--write");
  const date = todayJst();
  const allCases = loadHistoricalShockCases().filter(item => Boolean(item.ticker));
  const jpCases = allCases.filter(item => inferShockMarket({ country: item.country, ticker: item.ticker }) === "JP" && /^\d{4}$/.test(item.ticker ?? ""));
  const usCases = allCases.filter(item => inferShockMarket({ country: item.country, ticker: item.ticker }) === "US" && Boolean(item.ticker));
  const jqConfigured = isJQuantsConfigured();
  const twelveConfigured = isTwelveDataConfigured();

  const providerStatus: ProviderStatus[] = [
    { market: "JP", provider: "jquants", configured: jqConfigured, benchmark: `TOPIX proxy ${TOPIX_ETF_CODE}`, eligibleCases: jpCases.length },
    { market: "US", provider: "twelve_data", configured: twelveConfigured, benchmark: `S&P 500 proxy ${US_BENCHMARK_SYMBOL}`, eligibleCases: usCases.length },
  ];

  console.log(`[backfill:shock-outcomes] mode=${doWrite ? "WRITE" : "DRY-RUN"} JP=${jpCases.length} US=${usCases.length}`);
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
      // J-Quants内部にもrate limiterがあるため、同一caseのstock/benchmarkを並列化しない。
      const quotes = await fetchDailyQuotes(code, range.from, range.to);
      const benchmarkQuotes = await fetchDailyQuotes(TOPIX_ETF_CODE, range.from, range.to);
      const record = buildShockHistoricalOutcome(item, quotes, benchmarkQuotes, date, { market: "JP", benchmarkLabel: "TOPIX" });
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
      // Twelve Data client側のrequest intervalを尊重するため逐次取得する。
      const stock = await fetchTwelveDataDailyQuotes(symbol, range.from, range.to);
      const benchmark = await fetchTwelveDataDailyQuotes(US_BENCHMARK_SYMBOL, range.from, range.to);
      const record = buildShockHistoricalOutcome(
        item,
        stock as ShockOutcomeQuote[],
        benchmark as ShockOutcomeQuote[],
        date,
        { market: "US", benchmarkLabel: "S&P 500" },
      );
      if (record) records.push(record);
      else failures.push(`${item.id}: checkpoint price missing`);
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const calibration = calibrateShockThresholds(records);
  const calibrationByMarket = marketCalibration(records);
  console.log(`records=${records.length} failures/skips=${failures.length}`);
  for (const market of Object.keys(calibrationByMarket) as ShockMarket[]) {
    const marketRows = calibrationByMarket[market] ?? [];
    const ge12 = marketRows.find(row => row.bucket === "score_ge_12");
    console.log(`  ${market}: cases=${ge12?.cases ?? 0} avg1m=${ge12?.avgReturn1m ?? "-"} benchmarkRel1m=${ge12?.avgBenchmarkRelative1m ?? "-"}`);
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
    generatedAt: date,
    providers: providerStatus,
    methodology: "decision checkpoint base; market-specific benchmark; later returns are outcome-only and never feed historical score",
    records,
    calibration,
    calibrationByMarket,
    failures,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_outcomes_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_outcomes_latest.md", renderMarkdown(date, records, providerStatus, failures), "utf-8");
  console.log(`saved: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
