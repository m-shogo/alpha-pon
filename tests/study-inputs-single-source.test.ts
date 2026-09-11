// 価格を読む経路が1つに集約されているかの検査。
//
// なぜ要るか（2回踏んだ）:
//   1. suggest-event-labels が共通ローダーを使わず、流動性で絞らずに
//      全4,329銘柄を走査していた（他の CLI は999銘柄）
//   2. scan:moves が 13060 を除外していて、edge-study と母集団が
//      1銘柄ずれていた（1081 対 1082 / 評価 436,651 対 437,064）
//
// どちらも「同じ材料を別々に組んでいた」ことが原因。材料の組み立てが
// 2箇所以上にあると、片方だけ変わったときに
// 「イベントスタディには出たのに backtest では出ない」の原因が分からなくなる。
//
// 実データを使わずに構造だけ見る（CI で回せるように）。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 価格ストアから材料を組む CLI。ここに挙げたものは共通ローダーを通ること。 */
const PRICE_READING_CLIS = [
  "src/research/cli/edge-study.ts",
  "src/research/cli/backtest.ts",
  "src/research/cli/scan-abnormal-moves.ts",
  "src/research/cli/suggest-event-labels.ts",
  "src/research/cli/edinet-event-study.ts",
] as const;

/**
 * 共通ローダーの中でだけ呼ぶべきもの。
 *
 * CLI が直接呼んでいたら、そこで材料を組み直している。
 */
const LOADER_ONLY = [
  "buildUniverseBenchmark",
  "loadBacktestSeriesAsOf",
  "parseAdjustmentLedger",
] as const;

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function testEveryPriceReadingCliUsesTheSharedLoader(): void {
  // 部分一致だと `loadStudyInputsFromStoreXX` のような別名を通してしまう。
  // 単語境界で見る（変異テストで一度すり抜けた）。
  const called = /\bloadStudyInputsFromStore\b/;
  for (const path of PRICE_READING_CLIS) {
    assert.ok(
      called.test(read(path)),
      `${path} が共通ローダーを使っていない。材料を別に組むと母集団がずれる`,
    );
  }
}

function testCliDoesNotBuildInputsItself(): void {
  for (const path of PRICE_READING_CLIS) {
    const source = read(path);
    for (const name of LOADER_ONLY) {
      assert.ok(
        !source.includes(`${name}(`),
        `${path} が ${name} を直接呼んでいる。`
        + "材料の組み立ては study-inputs-from-store.ts に集約すること",
      );
    }
  }
}

function testSharedLoaderActuallyBuildsThem(): void {
  // 集約先が本当に組み立てているか。空の関数へ集約しても意味が無い。
  const loader = read("src/research/study-inputs-from-store.ts");
  for (const name of LOADER_ONLY) {
    assert.ok(loader.includes(`${name}(`), `共通ローダーが ${name} を呼んでいない`);
  }
  assert.ok(
    loader.includes("corporateActionDates"),
    "共通ローダーが権利落ち台帳を扱っていない",
  );
}

testEveryPriceReadingCliUsesTheSharedLoader();
testCliDoesNotBuildInputsItself();
testSharedLoaderActuallyBuildsThem();

console.log("study-inputs-single-source: 全テスト成功");
