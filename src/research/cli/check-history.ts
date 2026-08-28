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
import { auditEdgeProvenanceGitHistory, type EdgeProvenanceGitFacts } from "../edge-provenance-git-audit.js";
import { readEdgeProvenanceRepository } from "../edge-provenance.js";
import { checkChanges, type FileChange } from "../history-guard.js";
import { loadEdges } from "../io.js";
import { auditResearchAssetProvenanceGitHistory } from "../research-asset-provenance-git-audit.js";
import { readResearchAssetRegistry } from "../research-asset-registry.js";
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

function canonicalGitFacts(): EdgeProvenanceGitFacts {
  return {
    isCanonicalMainAncestor(commitSha) {
      return tryGit(["merge-base", "--is-ancestor", commitSha, "origin/main"]) !== null;
    },
    commitAt(commitSha) {
      return tryGit(["show", "-s", "--format=%cI", commitSha])?.trim() || null;
    },
    pathExistsAtCommit(commitSha, path) {
      return tryGit(["cat-file", "-e", `${commitSha}:${path}`]) !== null;
    },
    firstPathAdditionOnCanonicalMain(path) {
      const output = tryGit([
        "log",
        "--reverse",
        "--diff-filter=A",
        "--format=%H",
        "origin/main",
        "--",
        path,
      ]);
      return output?.split("\n").map((line) => line.trim()).find(Boolean) ?? null;
    },
  };
}

function auditCanonicalEdgeProvenance(): void {
  const canonicalMain = tryGit(["rev-parse", "--verify", "origin/main"])?.trim();
  if (!canonicalMain) {
    console.log("Formal Edge provenance Git audit: origin/main が無いためローカルではスキップします（CI は全履歴で検証します）");
    return;
  }

  const edgeIds = loadEdges().map((edge) => edge.id);
  const provenance = readEdgeProvenanceRepository(edgeIds);
  if (provenance.issues.length > 0) {
    console.error(`\nFormal Edge provenance 構造違反 ${provenance.issues.length} 件:`);
    for (const item of provenance.issues) {
      console.error(`  ERROR ${item.code} — ${item.target}: ${item.message}`);
    }
    fail("Formal Edge provenance Ledger が壊れています。Git履歴監査を続行できません。");
  }

  const issues = auditEdgeProvenanceGitHistory(provenance.records, canonicalGitFacts());
  if (issues.length > 0) {
    console.error(`\nFormal Edge provenance Git履歴違反 ${issues.length} 件:`);
    for (const item of issues) {
      console.error(`  ERROR ${item.code} — ${item.target}: ${item.message}`);
    }
    fail("Formal Edge provenance が canonical origin/main の実履歴と一致しません。");
  }

  console.log(`\nFormal Edge provenance Git audit: Proven ${provenance.records.length} / Pending ${provenance.missingEdgeIds.length}`);
  if (provenance.missingEdgeIds.length > 0) {
    console.log(`  pending: ${provenance.missingEdgeIds.join(", ")}`);
    console.log("  pending Edge は登録自体は許可されますが、exact provenance追記まで strict Research Knowledge から利用できません");
  }
  console.log("✓ Formal Edge provenance は canonical origin/main の実履歴と一致しています");
}

function auditCanonicalResearchAssetProvenance(): void {
  const canonicalMain = tryGit(["rev-parse", "--verify", "origin/main"])?.trim();
  if (!canonicalMain) {
    console.log("Research Asset provenance Git audit: origin/main が無いためローカルではスキップします（CI は全履歴で検証します）");
    return;
  }

  const registry = readResearchAssetRegistry();
  if (registry.issues.length > 0) {
    console.error(`\nResearch Asset Registry / provenance 構造違反 ${registry.issues.length} 件:`);
    for (const item of registry.issues) {
      console.error(`  ERROR ${item.code} — ${item.target}: ${item.message}`);
    }
    fail("Research Asset Registry が壊れています。Git履歴監査を続行できません。");
  }

  const issues = auditResearchAssetProvenanceGitHistory(registry.provenanceRecords, canonicalGitFacts());
  if (issues.length > 0) {
    console.error(`\nResearch Asset provenance Git履歴違反 ${issues.length} 件:`);
    for (const item of issues) {
      console.error(`  ERROR ${item.code} — ${item.target}: ${item.message}`);
    }
    fail("Research Asset provenance が canonical origin/main の実履歴と一致しません。");
  }

  console.log(`\nResearch Asset provenance Git audit: Proven ${registry.provenanceRecords.length} / Pending ${registry.missingProvenanceIds.length}`);
  if (registry.missingProvenanceIds.length > 0) {
    console.log(`  pending: ${registry.missingProvenanceIds.join(", ")}`);
    console.log("  pending Asset は登録自体は許可されますが、exact provenance追記まで strict Research Knowledge relation から利用できません");
  }
  console.log("✓ Research Asset provenance は canonical origin/main の実履歴と一致しています");
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
  } else {
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

  auditCanonicalEdgeProvenance();
  auditCanonicalResearchAssetProvenance();
}

main();
