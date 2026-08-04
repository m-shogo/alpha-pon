// Research OS — Research Queue の生成。
//   pnpm research:queue          生成して research/queue/queue.generated.json に書く
//   pnpm research:queue --check  再生成して差分があれば失敗する（CI 用）
//   pnpm research:queue --top    1位だけを表示（毎時の研究テーマ決定用）

import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import { loadResearchState, paths, writeGeneratedJson } from "../io.js";
import { buildQueue, DEFAULT_WEIGHTS, type QueueWeights } from "../queue.js";
import { stableStringify } from "../schema.js";
import { fail, parseArgs, todayJst } from "./common.js";

function loadWeights(): QueueWeights {
  const file = paths.queueWeights();
  if (!existsSync(file)) return DEFAULT_WEIGHTS;
  const parsed = load(readFileSync(file, "utf-8")) as Partial<QueueWeights> | null;
  return { ...DEFAULT_WEIGHTS, ...(parsed ?? {}) };
}

function main(): void {
  const { flags, options } = parseArgs();
  const state = loadResearchState();
  const outputPath = paths.queueOutput();

  // --check では既存ファイルの asOf で再計算する（日付が動いても差分にしないため）
  const existing = existsSync(outputPath)
    ? (JSON.parse(readFileSync(outputPath, "utf-8")) as { asOf?: string })
    : null;
  const asOf = options.get("as-of") ?? (flags.has("check") && existing?.asOf ? existing.asOf : todayJst());

  const queue = buildQueue(state, asOf, loadWeights());

  if (flags.has("top")) {
    const top = queue.entries[0];
    if (!top) fail("Queue が空です。Edge を1件以上登録してください。");
    console.log(`#1 ${top.edgeId} (VOI ${top.voi.toFixed(3)}, status=${top.status})`);
    console.log(`  理由: ${top.drivers.join(" / ")}`);
    console.log(`  推奨アクション: ${top.suggestedAction}`);
    return;
  }

  if (flags.has("check")) {
    if (!existing) fail(`${outputPath} がありません。pnpm research:queue を実行してコミットしてください。`);
    if (stableStringify(existing) !== stableStringify(queue)) {
      fail(`${outputPath} が最新ではありません。pnpm research:queue で再生成してコミットしてください。`);
    }
    console.log("✓ queue.generated.json は最新です");
    return;
  }

  writeGeneratedJson(outputPath, queue);
  console.log(`✓ ${outputPath} を生成しました（${queue.entries.length} 件, asOf=${asOf}）`);
  for (const entry of queue.entries.slice(0, 5)) {
    console.log(`  #${entry.rank} ${entry.edgeId} — VOI ${entry.voi.toFixed(3)} — ${entry.suggestedAction}`);
  }
}

main();
