// Research OS — Edge Registry の索引生成。
//   pnpm research:index          research/edge_registry/index.generated.json を更新
//   pnpm research:index --check  差分があれば失敗する（CI 用）

import { existsSync, readFileSync } from "fs";
import { buildEdgeIndex } from "../edge-registry.js";
import { loadResearchState, paths, writeGeneratedJson } from "../io.js";
import { stableStringify } from "../schema.js";
import { fail, parseArgs } from "./common.js";

function main(): void {
  const { flags } = parseArgs();
  const index = buildEdgeIndex(loadResearchState());
  const outputPath = paths.edgeIndex();

  if (flags.has("check")) {
    if (!existsSync(outputPath)) fail(`${outputPath} がありません。pnpm research:index を実行してください。`);
    const existing = JSON.parse(readFileSync(outputPath, "utf-8")) as unknown;
    if (stableStringify(existing) !== stableStringify(index)) {
      fail(`${outputPath} が最新ではありません。pnpm research:index で再生成してコミットしてください。`);
    }
    console.log("✓ index.generated.json は最新です");
    return;
  }

  writeGeneratedJson(outputPath, index);
  console.log(`✓ ${outputPath} を生成しました（${index.length} 件）`);
}

main();
