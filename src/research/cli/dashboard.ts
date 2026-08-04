// Research OS — Research Dashboard の生成。
//   pnpm research:dashboard          research/dashboard/dashboard.generated.md を更新
//   pnpm research:dashboard --check  再生成して差分があれば失敗する（CI 用）

import { existsSync, readFileSync } from "fs";
import { buildDashboard } from "../dashboard.js";
import { checkDecay } from "../decay.js";
import { checkEdgeRegistry, type Issue } from "../edge-registry.js";
import { loadResearchState, loadSchema, paths, readJsonl, writeGenerated } from "../io.js";
import { checkPit } from "../pit.js";
import { checkProductionIntegrity, type HoldoutAccessEntry } from "../promotion.js";
import { buildQueue, DEFAULT_WEIGHTS } from "../queue.js";
import { validate as validateSchema } from "../schema.js";
import { fail, parseArgs, todayJst } from "./common.js";

/** 生成時刻だけは実行ごとに変わるので、--check の比較からは除外する。 */
const GENERATED_AT_LINE = /^- 生成時刻: .*$/m;
const AS_OF_LINE = /^- 基準日 \(asOf\): (\d{4}-\d{2}-\d{2})$/m;

function main(): void {
  const { flags, options } = parseArgs();
  const state = loadResearchState();
  const outputPath = paths.dashboard();

  // --check は既存ファイルの asOf で再生成する（日付が変わっただけで失敗させないため）
  const existingMarkdown = existsSync(outputPath) ? readFileSync(outputPath, "utf-8") : null;
  const committedAsOf = existingMarkdown?.match(AS_OF_LINE)?.[1];
  const asOf = options.get("as-of") ?? (flags.has("check") && committedAsOf ? committedAsOf : todayJst());

  const accessLog = readJsonl(paths.holdoutAccessLog())
    .filter((raw) => validateSchema(raw, loadSchema("holdout-access")).length === 0)
    .map((raw) => raw as HoldoutAccessEntry);

  const issues: Issue[] = [
    ...checkEdgeRegistry(state),
    ...checkPit(state),
    ...checkProductionIntegrity(state, accessLog, asOf),
    ...checkDecay(state, asOf),
  ];

  const queue = buildQueue(state, asOf, DEFAULT_WEIGHTS);
  const markdown = buildDashboard({
    state,
    queue,
    accessLog,
    issues,
    asOf,
    generatedAt: new Date().toISOString(),
  });

  if (flags.has("check")) {
    if (existingMarkdown === null) fail(`${outputPath} がありません。pnpm research:dashboard を実行してください。`);
    const existing = existingMarkdown.replace(GENERATED_AT_LINE, "");
    if (existing.trimEnd() !== markdown.replace(GENERATED_AT_LINE, "").trimEnd()) {
      fail(`${outputPath} が最新ではありません。pnpm research:dashboard で再生成してコミットしてください。`);
    }
    console.log("✓ dashboard.generated.md は最新です");
    return;
  }

  writeGenerated(outputPath, markdown);
  console.log(`✓ ${outputPath} を生成しました`);
}

main();
