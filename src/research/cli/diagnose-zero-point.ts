// Research OS — 零点（無作為に買ったときの超過）が 0 にならない理由を測る。
//
//   pnpm research:diagnose:zero-point [--every=5] [--min-turnover=500000000]
//
// 何を測るか:
//   指数 B は**日次の等加重リターンを繋いだ複利**（Π(1 + その日の平均)）。
//   「無作為に1銘柄を買って h 日持つ」A は**銘柄ごとの複利の平均**（平均_i Π(1 + r)）。
//   2期間で展開すると **A - B = Cov_i(r_i1, r_i2)**（期間をまたぐ銘柄横断の共分散）。
//   上がった銘柄が上がり続ける傾向があれば正、反転する傾向なら負。
//   **符号は算術ではなくデータで決まる**（tests/research/zero-point-compounding-gap.test.ts）。
//
//   ここでは同じ保存庫・同じ流動性判定で A(h) と B(h) を並べ、
//   差 A-B が測られている零点（backtest 20日 +11.2bps）を説明できるかを見る。
//   共分散なので**期間ごとに変わる**。固定の定数として引いてはいけない。
//   新しい期間を測るときは、この診断も同じ期間で流し直す。
//
// 価格は研究期間だけを読む（封印は loadStudyInputsFromStore が入口で守る）。

import { averageTurnoverJpyBefore, type PriceSeries } from "../backtest.js";
import { loadStudyInputsFromStore } from "../study-inputs-from-store.js";

const HORIZONS = [1, 5, 20, 60] as const;

function argNumber(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (raw === undefined) return fallback;
  const parsed = Number(raw.slice(prefix.length));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`✗ --${name} は正の数で指定してください: ${raw}`);
    process.exit(1);
  }
  return parsed;
}

/** 銘柄ごとの日付 → 足の位置。毎回 findIndex すると O(日数×銘柄数) で終わらない。 */
function indexByDate(series: PriceSeries): Map<string, number> {
  const map = new Map<string, number>();
  for (const [index, bar] of series.bars.entries()) map.set(bar.date, index);
  return map;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 平均が数日に引っ張られていないかを見るために中央値も出す。 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function main(): void {
  const every = Math.trunc(argNumber("every", 5));
  const minTurnoverJpy = argNumber("min-turnover", 500_000_000);

  const inputs = loadStudyInputsFromStore({ minTurnoverJpy });
  const benchmarkIndex = indexByDate(inputs.benchmark);
  const seriesWithIndex = inputs.prices.map((series) => ({ series, byDate: indexByDate(series) }));

  console.log(`期間      : ${inputs.tradingDates[0]} 〜 ${inputs.tradingDates.at(-1)}（${inputs.tradingDates.length}営業日）`);
  console.log(`銘柄      : 一度でも流動性を満たした ${inputs.prices.length} / 全 ${inputs.universeSize}（会社以外 ${inputs.nonEquityCount} を除外）`);
  console.log(`指数      : ${inputs.benchmark.bars.length}日（構成が足りず作れなかった日 ${inputs.benchmarkSkippedDates.length}）`);
  console.log(`標本      : ${every} 営業日ごとに1日、流動性は各時点で判定（売買代金 ${(minTurnoverJpy / 1e8).toFixed(1)}億円/日）`);
  console.log("");
  console.log(
    "h日 | 標本日数 | 1日あたり銘柄数 | A=銘柄の複利平均 | B=指数の複利 | A-B（零点の説明） | A-B の中央値 | A-B>0 の日",
  );

  for (const horizon of HORIZONS) {
    const gaps: number[] = [];
    const stockReturns: number[] = [];
    const benchmarkReturns: number[] = [];
    const counts: number[] = [];

    for (let cursor = 0; cursor + horizon < inputs.tradingDates.length; cursor += every) {
      const entryDate = inputs.tradingDates[cursor]!;
      const exitDate = inputs.tradingDates[cursor + horizon]!;
      const benchmarkEntry = benchmarkIndex.get(entryDate);
      const benchmarkExit = benchmarkIndex.get(exitDate);
      if (benchmarkEntry === undefined || benchmarkExit === undefined) continue;

      const perStock: number[] = [];
      for (const { series, byDate } of seriesWithIndex) {
        const entry = byDate.get(entryDate);
        const exit = byDate.get(exitDate);
        if (entry === undefined || exit === undefined) continue;
        // 権利落ちをまたぐ区間は指数も除いているので、こちらも除く。
        const actionDates = inputs.corporateActionDates.get(series.code);
        if (actionDates !== undefined) {
          let touched = false;
          for (let index = entry + 1; index <= exit; index += 1) {
            if (actionDates.has(series.bars[index]!.date)) { touched = true; break; }
          }
          if (touched) continue;
        }
        // 流動性はエントリー前日まででみる（当日の出来高は寄付では分からない）。
        if (averageTurnoverJpyBefore(series.bars, entry) < minTurnoverJpy) continue;
        const entryClose = series.bars[entry]!.close;
        const exitClose = series.bars[exit]!.close;
        if (entryClose <= 0) continue;
        perStock.push((exitClose - entryClose) / entryClose);
      }
      if (perStock.length === 0) continue;

      const benchmarkReturn =
        (inputs.benchmark.bars[benchmarkExit]!.close - inputs.benchmark.bars[benchmarkEntry]!.close)
        / inputs.benchmark.bars[benchmarkEntry]!.close;
      const stockMean = mean(perStock);
      gaps.push((stockMean - benchmarkReturn) * 10_000);
      stockReturns.push(stockMean * 10_000);
      benchmarkReturns.push(benchmarkReturn * 10_000);
      counts.push(perStock.length);
    }

    if (gaps.length === 0) {
      console.log(`D+${String(horizon).padEnd(2)} | 標本なし`);
      continue;
    }
    const positiveDays = gaps.filter((gap) => gap > 0).length;
    console.log(
      `D+${String(horizon).padEnd(2)} | ${String(gaps.length).padStart(7)} | ${mean(counts).toFixed(0).padStart(14)} `
      + `| ${mean(stockReturns).toFixed(1).padStart(15)}bps | ${mean(benchmarkReturns).toFixed(1).padStart(11)}bps `
      + `| ${mean(gaps).toFixed(1).padStart(8)}bps | ${median(gaps).toFixed(1).padStart(10)}bps `
      + `| ${positiveDays}/${gaps.length}`,
    );
  }

  console.log("");
  console.log("※ A-B は「無作為に買っても指数を上回る分」。売買の腕ではなく指数の作り方から出る。");
  console.log("※ 測られている零点（backtest 20日 +11.2bps / イベントスタディ 20日 +14.7bps）と");
  console.log("   同じ大きさなら、零点の主因はこれで説明できる。");
  console.log("※ D+1 の差は母集団のずれ（指数の構成銘柄と標本の差）。保有を伸ばしたときの");
  console.log("   広がりが、期間をまたぐ銘柄横断の共分散。**期間ごとに測り直す量**。");
}

main();
