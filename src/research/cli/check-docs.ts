// Research OS — ドキュメントの整合性チェック（リンク切れ・生成物の手編集検知）。
//
//   pnpm research:check:docs
//
// 外部 lint ツールを足さずに、Research OS が壊れやすい2点だけを機械的に守る:
//   1. docs/research・docs/prompts・research/ 内の相対リンクが実在すること
//   2. 生成物（*.generated.*）に「生成物である」旨の注意書きが残っていること

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, normalize } from "path";
import { fail } from "./common.js";

const TARGET_DIRS = ["docs/research", "docs/prompts", "docs/roadmaps", "research"];
const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".md") ? [full] : [];
  });
}

function main(): void {
  const files = TARGET_DIRS.flatMap(walk).sort();
  const problems: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");

    for (const match of content.matchAll(LINK_PATTERN)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const resolved = normalize(join(dirname(file), target.split("#")[0]));
      if (!existsSync(resolved)) {
        problems.push(`${file}: リンク切れ -> ${target}`);
      }
    }

    if (file.includes(".generated.") && !content.includes("生成物")) {
      problems.push(`${file}: 生成物である旨の注意書きがありません`);
    }
  }

  console.log(`ドキュメント検査: ${files.length} ファイル`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ERROR ${problem}`);
    fail(`ドキュメントの問題が ${problems.length} 件あります`);
  }
  console.log("✓ リンク切れなし / 生成物の表示あり");
}

main();
