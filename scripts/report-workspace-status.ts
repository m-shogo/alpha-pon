// daily 実行時の作業コピー状態を JSON で出す。
//
//   node --import tsx/esm scripts/report-workspace-status.ts
//
// git の事実収集だけをここで行い、判定は src/pipeline-workspace-status.ts の
// 純関数に任せる。git が使えない環境でも daily を止めないよう、
// 収集に失敗した場合は severity=warning の JSON を返して exit 0 する。

import { execFileSync } from "node:child_process";
import {
  assessWorkspaceStatus,
  formatWorkspaceStatusLine,
  type WorkspaceStatus,
} from "../src/pipeline-workspace-status.js";

const DEFAULT_BRANCH = process.env.ALPHA_PON_DEFAULT_BRANCH ?? "main";

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function unavailable(reason: string): WorkspaceStatus {
  return {
    branch: "unknown",
    commit: "0000000",
    shortCommit: "0000000",
    onDefaultBranch: false,
    behindCount: null,
    aheadCount: null,
    dirty: false,
    severity: "warning",
    warnings: [reason],
  };
}

function main(): void {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = git(["rev-parse", "HEAD"]);

  let status: WorkspaceStatus;
  if (!branch || !commit) {
    status = unavailable("git から作業コピーの状態を取得できませんでした");
  } else {
    // CI は毎回まっさらな checkout なので、作業コピーの古さを測る意味がない。
    // 無駄なネットワーク呼び出しを避けるため fetch しない。
    const inCi = process.env.CI !== undefined && process.env.CI !== "" && process.env.CI !== "false";
    if (!inCi) {
      // ネットワークが無くても daily を止めない。取れなければ比較不能として扱う。
      git(["fetch", "--quiet", "origin", DEFAULT_BRANCH]);
    }
    const counts = inCi
      ? null
      : git(["rev-list", "--left-right", "--count", `origin/${DEFAULT_BRANCH}...HEAD`]);
    let behindCount: number | null = null;
    let aheadCount: number | null = null;
    if (counts) {
      const [left, right] = counts.split(/\s+/).map((value) => Number(value));
      if (Number.isSafeInteger(left) && Number.isSafeInteger(right)) {
        behindCount = left;
        aheadCount = right;
      }
    }
    const dirtyOutput = git(["status", "--porcelain"]);
    status = assessWorkspaceStatus({
      branch,
      commit,
      defaultBranch: DEFAULT_BRANCH,
      behindCount,
      aheadCount,
      dirty: dirtyOutput !== null && dirtyOutput !== "",
      ...(inCi ? { comparisonUnavailableReason: "CI は毎回まっさらな checkout のため比較不要" } : {}),
    });
  }

  // 警告は stderr、機械可読な JSON は stdout。呼び出し側が JSON だけ拾えるようにする。
  if (status.severity !== "ok") console.error(formatWorkspaceStatusLine(status));
  process.stdout.write(JSON.stringify(status));
}

main();
