// Research OS — Append Only / 不変性ガード（git 連携）。
//
//   pnpm research:check:history                  origin/main（無ければ HEAD~1）と比較
//   pnpm research:check:history --base=<ref>     比較先を指定
//
// 「過去の記録を書き換えて都合よく見せる」ことを構造的に防ぐのが目的。
// 純ロジックは src/research/history-guard.ts 側にあり、ここは git の呼び出しのみ。

import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import { checkChanges, type FileChange } from "../history-guard.js";
import { fail, parseArgs } from "./common.js";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
}

function tryGit(args: string[]): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function resolveBase(explicit: string | undefined): string | null {
  if (explicit) return explicit;
  if (tryGit(["rev-parse", "--verify", "origin/main"])) {
    return tryGit(["merge-base", "origin/main", "HEAD"])?.trim() ?? "origin/main";
  }
  if (tryGit(["rev-parse", "--verify", "HEAD~1"])) return "HEAD~1";
  return null; // 初回コミット。比較対象が無いので検査をスキップする。
}

const CHANGE_TYPES: Record<string, FileChange["changeType"]> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
};

function collectChanges(base: string): FileChange[] {
  const raw = git(["diff", "--name-status", "--no-renames", base, "--", "research/"]);
  const changes: FileChange[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [status, path] = line.split("\t");
    const changeType = CHANGE_TYPES[status[0]] ?? "modified";
    changes.push({
      path,
      changeType,
      oldContent: changeType === "added" ? null : tryGit(["show", `${base}:${path}`]),
      newContent: changeType === "deleted" ? null : existsSync(path) ? readFileSync(path, "utf-8") : null,
    });
  }
  return changes;
}

function main(): void {
  const { options } = parseArgs();
  const base = resolveBase(options.get("base"));

  if (!base) {
    console.log("比較対象のコミットがありません（初回コミット）。履歴ガードをスキップします。");
    return;
  }

  const changes = collectChanges(base);
  if (changes.length === 0) {
    console.log(`✓ research/ に変更はありません（base: ${base}）`);
    return;
  }

  const violations = checkChanges(changes, (content) => load(content) as Record<string, unknown>);

  console.log(`履歴ガード（base: ${base}）: ${changes.length} ファイルの変更を検査しました`);
  for (const change of changes) console.log(`  ${change.changeType.padEnd(8)} ${change.path}`);

  if (violations.length > 0) {
    console.error(`\n違反 ${violations.length} 件:`);
    for (const violation of violations) {
      console.error(`  ERROR ${violation.code} — ${violation.file}: ${violation.message}`);
    }
    fail("Append Only / 不変性の違反があります。既存の記録は書き換えず、新しい記録を追加してください。");
  }

  console.log("\n✓ Append Only と不変性の違反はありません");
}

main();
