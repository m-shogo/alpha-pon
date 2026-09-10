// catchup: 今日の実行が失敗したまま過去日を skipped にしないこと。
//
// 元のテストはスクリプトのソーステキストへの正規表現 assertion だったが、
// `for (const date of pastDates)[\s\S]*if (job.canBackfill)[\s\S]*markSkipped(...)`
// の `[\s\S]*` が defer ガードごと飲み込むため、
// 「markSkipped が守られているか」を原理的に判定できていなかった。
// 判断を純関数へ切り出し、実挙動で検証する。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideCatchupPastDateAction } from "../src/catchup-past-date-action.js";

// 今日の実行が過去分を集約する設計なので、今日が失敗したら過去日は未解決のまま残す。
assert.equal(
  decideCatchupPastDateAction({ canBackfill: true, todayCovered: false }),
  "defer",
  "today run failure を無視して past date を skipped 化してはいけない",
);

assert.equal(
  decideCatchupPastDateAction({ canBackfill: true, todayCovered: true }),
  "skip",
  "今日の実行が成功していれば過去日は集約済みとして skipped にしてよい",
);

// backfill 不可のジョブは、今日の成否によらず missing として記録する。
assert.equal(decideCatchupPastDateAction({ canBackfill: false, todayCovered: true }), "missing");
assert.equal(decideCatchupPastDateAction({ canBackfill: false, todayCovered: false }), "missing");

// defer は「未解決のまま残す」であって「成功扱い」ではない。3値が混ざらないことを固定する。
const actions = new Set([
  decideCatchupPastDateAction({ canBackfill: true, todayCovered: false }),
  decideCatchupPastDateAction({ canBackfill: true, todayCovered: true }),
  decideCatchupPastDateAction({ canBackfill: false, todayCovered: true }),
]);
assert.deepEqual([...actions].sort(), ["defer", "missing", "skip"]);

// ロジックがスクリプト側へ再インライン展開されて分岐が二重化しないよう、
// run-catchup.ts が純関数を使い続けていることだけは確認する。
const source = readFileSync(new URL("../scripts/run-catchup.ts", import.meta.url), "utf-8");
assert.match(
  source,
  /decideCatchupPastDateAction\(\{ canBackfill: job\.canBackfill, todayCovered \}\)/,
  "run-catchup.ts は判断を純関数へ委譲し続けること",
);
assert.doesNotMatch(
  source,
  /markSkipped\(job\.name, date\);[\s\S]{0,80}\}\s*else\s*\{/,
  "markSkipped を canBackfill の分岐へ直接書き戻さない",
);

console.log("catchup-failure-defer.test.ts passed");
