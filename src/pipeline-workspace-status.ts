// 毎朝の daily が「どのコードで動いたか」を記録・警告する。
//
// 背景:
//   launchd の plist は WorkingDirectory をリポジトリ本体に向け、
//   scripts/run-daily-complete.sh をそのまま実行する。
//   そのため作業コピーが取り残されたブランチにあると、古いコードが毎朝動く。
//   2026-09-10 時点で main から 1555 commits 遅れており、
//   ログに出ていた TDnet 404（62回）と mapfile エラーは
//   どちらも「修正済みのバグが再現していただけ」だった。
//   実行しているコードが古いことに気づく手段が無かったのが本質。
//
// 方針:
//   daily を止めない。「daily本体以外の失敗で全体を止めない」という
//   既存の設計方針を守り、状態として記録し警告するだけにする。
//   ただし黙らない。pipeline_status に載せて ops 側から見えるようにする。

export type WorkspaceSeverity = "ok" | "warning" | "stale";

export interface WorkspaceFacts {
  /** 現在のブランチ名。detached HEAD の場合は "HEAD"。 */
  branch: string;
  /** 現在の commit SHA。 */
  commit: string;
  /** 既定ブランチ名。 */
  defaultBranch: string;
  /** 既定ブランチのリモート追跡から何コミット遅れているか。比較不能なら null。 */
  behindCount: number | null;
  /** 同じく何コミット進んでいるか。比較不能なら null。 */
  aheadCount: number | null;
  /** 作業ツリーに未コミットの変更があるか。 */
  dirty: boolean;
  /** これ以上遅れていたら stale とみなす commit 数。既定 20。 */
  staleThresholdCommits?: number;
  /**
   * 比較できなかった理由。behindCount / aheadCount が null のときだけ使う。
   * 「取得に失敗した」と「意図的に比較しなかった」を取り違えないため。
   */
  comparisonUnavailableReason?: string;
}

export interface WorkspaceStatus {
  branch: string;
  commit: string;
  shortCommit: string;
  onDefaultBranch: boolean;
  behindCount: number | null;
  aheadCount: number | null;
  dirty: boolean;
  severity: WorkspaceSeverity;
  warnings: string[];
}

const DEFAULT_STALE_THRESHOLD_COMMITS = 20;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

export function assessWorkspaceStatus(facts: WorkspaceFacts): WorkspaceStatus {
  if (typeof facts.branch !== "string" || facts.branch.trim() === "") {
    throw new Error("workspace branch must be a non-empty string");
  }
  if (!COMMIT_PATTERN.test(facts.commit)) {
    throw new Error(`workspace commit must be a hex sha: ${facts.commit}`);
  }
  if (typeof facts.defaultBranch !== "string" || facts.defaultBranch.trim() === "") {
    throw new Error("workspace defaultBranch must be a non-empty string");
  }
  for (const [label, value] of [["behindCount", facts.behindCount], ["aheadCount", facts.aheadCount]] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${label} must be a non-negative safe integer or null: ${value}`);
    }
  }
  const threshold = facts.staleThresholdCommits ?? DEFAULT_STALE_THRESHOLD_COMMITS;
  if (!Number.isSafeInteger(threshold) || threshold < 1) {
    throw new Error(`staleThresholdCommits must be a positive safe integer: ${threshold}`);
  }

  const onDefaultBranch = facts.branch === facts.defaultBranch;
  const warnings: string[] = [];

  if (!onDefaultBranch) {
    warnings.push(
      facts.branch === "HEAD"
        ? `detached HEAD で実行しています（既定ブランチ: ${facts.defaultBranch}）`
        : `既定ブランチ ${facts.defaultBranch} ではなく ${facts.branch} で実行しています`,
    );
  }
  if (facts.behindCount === null || facts.aheadCount === null) {
    const reason = facts.comparisonUnavailableReason?.trim();
    warnings.push(
      reason
        ? `origin/${facts.defaultBranch} と比較していません（${reason}）`
        : `origin/${facts.defaultBranch} と比較できませんでした（fetch 失敗またはリモート未設定）`,
    );
  } else {
    if (facts.behindCount > 0) {
      warnings.push(
        `origin/${facts.defaultBranch} より ${facts.behindCount} commits 遅れたコードで実行しています`,
      );
    }
    if (facts.aheadCount > 0) {
      warnings.push(`未 push の ${facts.aheadCount} commits を含むコードで実行しています`);
    }
  }
  if (facts.dirty) {
    warnings.push("作業ツリーに未コミットの変更があります");
  }

  const isStale = facts.behindCount !== null && facts.behindCount >= threshold;
  const severity: WorkspaceSeverity = isStale ? "stale" : warnings.length > 0 ? "warning" : "ok";

  return {
    branch: facts.branch,
    commit: facts.commit,
    shortCommit: facts.commit.slice(0, 8),
    onDefaultBranch,
    behindCount: facts.behindCount,
    aheadCount: facts.aheadCount,
    dirty: facts.dirty,
    severity,
    warnings,
  };
}

/** 人が読む1行サマリ。ログの先頭に出す用。 */
export function formatWorkspaceStatusLine(status: WorkspaceStatus): string {
  const head = `[workspace] ${status.branch}@${status.shortCommit} severity=${status.severity}`;
  return status.warnings.length === 0 ? head : `${head} :: ${status.warnings.join(" / ")}`;
}
