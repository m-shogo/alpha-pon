// 価格ストアを読む CLI が、封印期間（holdout）を必ず尊重しているかの検査。
//
// なぜ要るか（2026-09-11 に実際に起きたこと）:
//   正本の金庫は 2025-07-01 〜 2026-06-30 を封印していたのに、
//   - `scan:moves` は `--to` を省くと**取り込み最終日まで**走っていた
//   - `edge-study` は bundle に holdout 節が無いと「保護なし」で素通りしていた
//   - `edinet-event-study` / `suggest-event-labels` は何も見ていなかった
//   - さらに bundle 側に自前の manifest を書くと封印を狭められた
//
//   結果、§3 の測定は封印内の約8ヶ月を使ってしまった。
//   **封印は「全部の入口で効いて初めて封印」。**1つでも抜けていれば意味が無い。
//
// 判定:
//   価格ストアを読む CLI（loadStudyInputsFromStore を呼ぶもの）は、
//   `resolveResearchTo`（期間で切る）か `mergeHoldoutManifests`
//   （サンプル単位で分割する）のどちらかを使っていること。
//
//   例外は2種類だけ。
//     EXEMPT          … 封印を開ける正規の入口（理由を書く）
//     NO_RANGE_EXEMPT … 期間の引数を受け取らない CLI。入口の既定が研究期間なので安全。
//                       その前提（日付の引数を読まない・allowSealed を渡さない）を
//                       **このスクリプトが機械で確かめる**。理由の文だけで通さない。

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CLI_DIR = "src/research/cli";

/** 価格ストアを読むことを示す呼び出し。 */
const READS_PRICE_STORE = [
  "loadStudyInputsFromStore",
  "loadBacktestSeriesAsOf",
  // backtest-store-run.ts を通す CLI。ここに無いと、共通化した途端に検査から外れる。
  "buildFromStore",
];

/** 封印を効かせていることを示す呼び出し。 */
const HONORS_HOLDOUT = [
  "resolveResearchTo",
  "mergeHoldoutManifests",
];

/** 封印を要求しないもの。理由を必ず書く。 */
const EXEMPT: Record<string, string> = {
  "src/research/cli/holdout-open.ts":
    "封印を開ける正規の入口。事前登録のコミット・1 Edge 1回・取り込みの穴・窓との重なりを確かめ、"
    + "access_log に記録してから確認期間を読む（tests/research/holdout-open-cli.test.ts）",
};

/**
 * 期間を受け取らない CLI。入口（loadStudyInputsFromStore）の既定が研究期間
 * （#2137 で入口に移した）なので、自分で切らなくても封印の外に出ない。
 * 前提が崩れたら下の検査で落ちる。
 */
const NO_RANGE_EXEMPT: Record<string, string> = {
  "src/research/cli/diagnose-zero-point.ts":
    "零点（無作為エントリーの超過）の診断。期間の引数を持たず、入口の既定だけを読む",
};

/** NO_RANGE_EXEMPT が名乗る前提を壊す字句。1つでもあれば例外を認めない。 */
const RANGE_TOKENS = ["allowSealed", "--to", "--from", "asOf", "vaultManifest"];

const files = readdirSync(CLI_DIR)
  .filter((name) => name.endsWith(".ts"))
  .sort();
assert.ok(files.length > 0, `${CLI_DIR} に CLI が1本も無い。走査経路が壊れている`);

const problems: string[] = [];
let checked = 0;

/** 部分一致だと `resolveResearchToX` のような別名を通してしまう（変異テストですり抜けた）。 */
function calls(text: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(text);
}

for (const name of files) {
  const path = join(CLI_DIR, name);
  const text = readFileSync(path, "utf-8");
  if (!READS_PRICE_STORE.some((call) => calls(text, call))) continue;
  checked += 1;
  if (path in EXEMPT) continue;
  if (path in NO_RANGE_EXEMPT) {
    const broken = RANGE_TOKENS.filter((token) => text.includes(token));
    if (broken.length > 0) {
      problems.push(
        `期間を受け取らない前提の例外が崩れている: ${path}\n`
        + `  ${broken.join(" / ")} を含む。期間を扱うなら ${HONORS_HOLDOUT.join(" か ")} を通すこと`,
      );
    }
    continue;
  }
  if (HONORS_HOLDOUT.some((call) => calls(text, call))) continue;
  problems.push(
    `封印を尊重していない: ${path}\n`
    + `  価格ストアを読むなら ${HONORS_HOLDOUT.join(" か ")} を通すこと。`
    + "  --to を省いたときに取り込み最終日まで走ると、封印の中を覗く。",
  );
}

for (const [label, list] of [["EXEMPT", EXEMPT], ["NO_RANGE_EXEMPT", NO_RANGE_EXEMPT]] as const) {
  for (const path of Object.keys(list)) {
    const name = path.replace(`${CLI_DIR}/`, "");
    if (!files.includes(name)) {
      problems.push(`一覧が古い: ${path} — ${label} から消すこと`);
    }
  }
}

console.log(
  `封印カバレッジ: 価格ストアを読む CLI ${checked}本 / 例外 ${Object.keys(EXEMPT).length}本`
  + ` / 期間を受け取らない例外 ${Object.keys(NO_RANGE_EXEMPT).length}本`,
);
if (problems.length > 0) {
  console.error("");
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} 件。`);
  process.exit(1);
}
console.log("✓ 価格ストアを読む CLI はすべて封印を通している");
