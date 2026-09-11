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

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CLI_DIR = "src/research/cli";

/** 価格ストアを読むことを示す呼び出し。 */
const READS_PRICE_STORE = [
  "loadStudyInputsFromStore",
  "loadBacktestSeriesAsOf",
];

/** 封印を効かせていることを示す呼び出し。 */
const HONORS_HOLDOUT = [
  "resolveResearchTo",
  "mergeHoldoutManifests",
];

/** 封印を要求しないもの。理由を必ず書く。 */
const EXEMPT: Record<string, string> = {};

const files = readdirSync(CLI_DIR)
  .filter((name) => name.endsWith(".ts"))
  .sort();
assert.ok(files.length > 0, `${CLI_DIR} に CLI が1本も無い。走査経路が壊れている`);

const problems: string[] = [];
let checked = 0;

for (const name of files) {
  const path = join(CLI_DIR, name);
  const text = readFileSync(path, "utf-8");
  if (!READS_PRICE_STORE.some((call) => text.includes(call))) continue;
  checked += 1;
  if (path in EXEMPT) continue;
  if (HONORS_HOLDOUT.some((call) => text.includes(call))) continue;
  problems.push(
    `封印を尊重していない: ${path}\n`
    + `  価格ストアを読むなら ${HONORS_HOLDOUT.join(" か ")} を通すこと。`
    + "  --to を省いたときに取り込み最終日まで走ると、封印の中を覗く。",
  );
}

for (const path of Object.keys(EXEMPT)) {
  const name = path.replace(`${CLI_DIR}/`, "");
  if (!files.includes(name)) {
    problems.push(`一覧が古い: ${path} — EXEMPT から消すこと`);
  }
}

console.log(`封印カバレッジ: 価格ストアを読む CLI ${checked}本 / 例外 ${Object.keys(EXEMPT).length}本`);
if (problems.length > 0) {
  console.error("");
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} 件。`);
  process.exit(1);
}
console.log("✓ 価格ストアを読む CLI はすべて封印を通している");
