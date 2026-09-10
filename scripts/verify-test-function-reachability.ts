// テストファイル内の「定義したが呼んでいないテスト関数」を探す。
//
// ファイル単位の未実行は run-all-tests.ts の glob で塞いだが、
// 1ファイルの中で定義だけして呼ばない関数は拾えない。
// 2026-09-11 に実際にそれをやり、書いたアサーションが1つも走っていなかった。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { findUncalledTestFunctions } from "../src/test-function-reachability.js";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const root = resolve(process.cwd(), "tests");
const files = walk(root).sort();
const findings = files.flatMap((path) =>
  findUncalledTestFunctions({
    file: relative(process.cwd(), path),
    source: readFileSync(path, "utf-8"),
  }));

console.log(`検査 ${files.length}ファイル`);

if (findings.length > 0) {
  console.error(`\n定義されているが呼ばれていないテスト関数 ${findings.length}件:`);
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.name}`);
  }
  console.error("\nこれらのアサーションは1つも実行されていない。");
  console.error("呼び出しを追加するか、不要なら削除すること。");
  process.exit(1);
}

console.log("test-function-reachability: ok");
