// 保存した価格を API の生の返答と突き合わせる。
//
//   pnpm verify:price-store-vs-api -- --date=2025-09-17
//   pnpm verify:price-store-vs-api -- --sample=5
//
// ネットワークと API キーが要るので CI では回さない。
// `mapJQuantsFreeQuote` を触ったときに手で回す。
//
// verify-price-store-integrity はストアの中だけを見るので、
// 「取り込みの変換が間違っている」形の壊れ方は見つけられない。

import { fetchDailyQuotesByDate, isJQuantsConfigured } from "../src/fetcher/jquants.js";
import { diffStoreAgainstApi } from "../src/research/providers/jquants-store-api-diff.js";
import {
  listIngestedDates,
  readDateRecords,
} from "../src/research/providers/jquants-daily-store.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

/** 等間隔に抜き取る。先頭と末尾は必ず含める（取り込みの切れ目は端に出る）。 */
function sample(dates: string[], count: number): string[] {
  if (count <= 0 || dates.length <= count) return dates;
  const picked = new Set<string>([dates[0]!, dates.at(-1)!]);
  const step = (dates.length - 1) / (count - 1);
  for (let i = 0; i < count; i += 1) picked.add(dates[Math.round(i * step)]!);
  return [...picked].sort();
}

async function main(): Promise<void> {
  const ingested = listIngestedDates();
  if (ingested.length === 0) {
    console.log("price-store-vs-api: 取り込み済みの価格が無いので検査対象なし: ok");
    return;
  }
  if (!isJQuantsConfigured()) {
    console.log("price-store-vs-api: JQUANTS_API_KEY が未設定。実行できない");
    process.exitCode = 1;
    return;
  }

  const one = argValue("date");
  const sampleSize = Number(argValue("sample") ?? 3);
  const targets = one ? [one] : sample(ingested, sampleSize);

  let failed = 0;
  for (const [index, tradingDate] of targets.entries()) {
    // バースト枠があるので間隔を空ける（実測 20秒が持続可能）。
    if (index > 0) await new Promise((done) => setTimeout(done, 20_000));

    const quotes = await fetchDailyQuotesByDate(tradingDate);
    if (quotes === null) {
      console.log(`  ${tradingDate}  契約範囲の外。比較しない`);
      continue;
    }
    const report = diffStoreAgainstApi({
      tradingDate,
      apiQuotes: quotes,
      storedRecords: readDateRecords(tradingDate),
    });
    const ok = report.differences.length === 0;
    console.log(
      `  ${tradingDate}  API ${report.apiRowCount}件 / ストア ${report.storedRowCount}件`
      + ` / OHLCV照合 ${report.comparedCount}銘柄 → ${ok ? "一致" : `不一致 ${report.differences.length}`}`,
    );
    if (!ok) {
      failed += 1;
      for (const one of report.differences.slice(0, 10)) {
        console.error(`     ${one.code} ${one.field}: ストア ${one.stored} ≠ API ${one.api}`);
      }
      if (report.differences.length > 10) {
        console.error(`     ほか ${report.differences.length - 10}件`);
      }
    }
  }

  if (failed > 0) {
    console.error(`price-store-vs-api: ${failed}営業日で不一致`);
    process.exitCode = 1;
    return;
  }
  console.log("price-store-vs-api: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
