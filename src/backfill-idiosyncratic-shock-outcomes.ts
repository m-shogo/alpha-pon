// 企業固有ショック過去事例の定量 outcome backfill。
// JP上場銘柄について、decision checkpoint 起点の1w/1m/3m/1yとTOPIX相対を計算する。
//
// pnpm backfill:shock-outcomes          # dry-run
// pnpm backfill:shock-outcomes --write  # data/idiosyncratic_shock_outcomes.json を更新
//
// scoreは当時checkpointの情報、returnはその後の観測値。未来情報をscoreへ逆流させない。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured, type DailyQuote } from "./fetcher/jquants.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import {
  buildShockHistoricalOutcome,
  calibrateShockThresholds,
  outcomeFetchRange,
  type ShockHistoricalOutcomeRecord,
} from "./idiosyncratic-shock-outcomes.js";

const TOPIX_ETF_CODE = "1306";
const OUTPUT_PATH = "data/idiosyncratic_shock_outcomes.json";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderMarkdown(date: string, records: ShockHistoricalOutcomeRecord[]): string {
  const calibration = calibrateShockThresholds(records);
  const lines = [
    "# 企業固有ショック 定量outcome / 閾値検証",
    "",
    `生成日: ${date}`,
    "",
    "> scoreはdecision checkpoint時点の評価。リターンはその後の結果で、scoreには逆流させません。",
    "> 12点は暫定運用閾値です。サンプルが増えるまで自動で『有効』と断定しません。",
    "",
    `- JP価格取得済みケース: ${records.length}`,
    "",
    "## score bucket別",
    "",
    "| bucket | cases | n1m | avg1m | median1m | +rate1m | TOPIX相対1m | n3m | avg3m | +rate3m | TOPIX相対3m | n1y | avg1y | +rate1y | TOPIX相対1y |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of calibration) {
    const f = (value: number | null) => value == null ? "-" : value.toFixed(2);
    lines.push(`| ${row.bucket} | ${row.cases} | ${row.n1m} | ${f(row.avgReturn1m)} | ${f(row.medianReturn1m)} | ${f(row.positiveRate1m)}% | ${f(row.avgTopixRelative1m)} | ${row.n3m} | ${f(row.avgReturn3m)} | ${f(row.positiveRate3m)}% | ${f(row.avgTopixRelative3m)} | ${row.n1y} | ${f(row.avgReturn1y)} | ${f(row.positiveRate1y)}% | ${f(row.avgTopixRelative1y)} |`);
  }
  lines.push("", "## ケース", "");
  for (const row of records.sort((a, b) => b.checkpoint.localeCompare(a.checkpoint))) {
    const f = (value: number | null) => value == null ? "-" : `${value.toFixed(2)}%`;
    lines.push(`### ${row.code} ${row.company} (${row.score}/20)`);
    lines.push(`- event/checkpoint: ${row.eventDate} / ${row.checkpoint}`);
    lines.push(`- shock drawdown: ${f(row.shockDrawdownPct)} (${row.preEventDate ?? "-"} → low ${row.shockLowDate ?? "-"})`);
    lines.push(`- return: 1w ${f(row.return1w)} / 1m ${f(row.return1m)} / 3m ${f(row.return3m)} / 1y ${f(row.return1y)}`);
    lines.push(`- TOPIX relative: 1m ${f(row.topixRelative1m)} / 3m ${f(row.topixRelative3m)} / 1y ${f(row.topixRelative1y)}`);
    lines.push("");
  }
  lines.push("## 解釈ルール", "");
  lines.push("- `score_ge_12` が `score_lt_12` を継続的に上回るかを見る。");
  lines.push("- 平均だけでなく中央値・プラス率・TOPIX相対を併用する。");
  lines.push("- nが小さいうちは閾値を自動変更しない。");
  lines.push("- 事件後の買収・アクティビスト・市況変化など交絡は別レビューする。");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const doWrite = process.argv.includes("--write");
  const date = todayJst();
  const cases = loadHistoricalShockCases()
    .filter(item => item.country === "JP" && item.ticker && /^\d{4}$/.test(item.ticker));

  console.log(`[backfill:shock-outcomes] mode=${doWrite ? "WRITE" : "DRY-RUN"} cases=${cases.length}`);
  if (!isJQuantsConfigured()) {
    console.log("J-Quants未設定: 定量backfillは実行できません。コード/対象ケースのpreviewのみ行います。");
    for (const item of cases) console.log(`  ${item.ticker} ${item.company}: ${item.eventDate} checkpoint=${item.decisionCheckpoint} score=${item.score}`);
    if (doWrite) process.exitCode = 1;
    return;
  }

  const earliest = cases.reduce((min, item) => item.eventDate < min ? item.eventDate : min, cases[0]?.eventDate ?? date);
  let benchmarkQuotes: DailyQuote[] = [];
  try {
    benchmarkQuotes = await fetchDailyQuotes(TOPIX_ETF_CODE, earliest.replaceAll("-", ""), date.replaceAll("-", ""));
  } catch (error) {
    console.error(`TOPIX取得失敗: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const records: ShockHistoricalOutcomeRecord[] = [];
  const failures: string[] = [];
  for (const item of cases) {
    const code = item.ticker!;
    const range = outcomeFetchRange(item, date);
    try {
      console.log(`  fetch ${code} ${item.company}: ${range.from}-${range.to}`);
      const quotes = await fetchDailyQuotes(code, range.from, range.to);
      const record = buildShockHistoricalOutcome(item, quotes, benchmarkQuotes, date);
      if (record) records.push(record);
      else failures.push(`${item.id}: checkpoint price missing`);
    } catch (error) {
      failures.push(`${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(350);
  }

  const calibration = calibrateShockThresholds(records);
  console.log(`records=${records.length} failures=${failures.length}`);
  for (const row of calibration) {
    console.log(`  ${row.bucket}: cases=${row.cases} n1m=${row.n1m} avg1m=${row.avgReturn1m ?? "-"} rel1m=${row.avgTopixRelative1m ?? "-"}`);
  }
  if (failures.length) failures.forEach(value => console.log(`  [warn] ${value}`));

  if (!doWrite) {
    console.log("dry-run: ファイルは変更していません。--write で保存します。");
    return;
  }

  mkdirSync("data", { recursive: true });
  mkdirSync("reports", { recursive: true });
  const payload = {
    generatedAt: date,
    benchmarkCode: TOPIX_ETF_CODE,
    source: "jquants",
    methodology: "decision checkpoint base; later returns are outcome-only and never feed historical score",
    records,
    calibration,
    failures,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_outcomes_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_outcomes_latest.md", renderMarkdown(date, records), "utf-8");
  console.log(`saved: ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
