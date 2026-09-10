// daily がどのコードで動いたかの記録・警告のテスト。
//
// 守りたい性質:
//   1. 古い作業コピーで動いていることに気づける
//   2. daily を止めない（severity を返すだけで例外にしない）
//   3. 比較不能を「問題なし」と取り違えない
//   4. 不正な入力は起動時に落とす

import assert from "node:assert/strict";
import {
  assessWorkspaceStatus,
  formatWorkspaceStatusLine,
  type WorkspaceFacts,
} from "../src/pipeline-workspace-status.js";

const SHA = "48b8b9e190392380a6f71b867e6d325351178f82";

function facts(over: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  return {
    branch: "main",
    commit: SHA,
    defaultBranch: "main",
    behindCount: 0,
    aheadCount: 0,
    dirty: false,
    ...over,
  };
}

function testCleanWorkspaceIsOk() {
  const status = assessWorkspaceStatus(facts());
  assert.equal(status.severity, "ok");
  assert.deepEqual(status.warnings, []);
  assert.equal(status.onDefaultBranch, true);
  assert.equal(status.shortCommit, "48b8b9e1");
}

function testStaleWorkspaceIsFlagged() {
  // 2026-09-10 に実際に起きた状況: main から1555 commits 遅れ。
  const status = assessWorkspaceStatus(facts({ behindCount: 1555 }));
  assert.equal(status.severity, "stale", "大きく遅れていることを warning で埋もれさせない");
  assert.ok(status.warnings.some((one) => one.includes("1555 commits 遅れた")));
}

function testSmallLagIsWarningNotStale() {
  const status = assessWorkspaceStatus(facts({ behindCount: 3 }));
  assert.equal(status.severity, "warning");
  assert.ok(status.warnings.some((one) => one.includes("3 commits 遅れた")));
}

function testStaleThresholdIsConfigurable() {
  assert.equal(assessWorkspaceStatus(facts({ behindCount: 5, staleThresholdCommits: 5 })).severity, "stale");
  assert.equal(assessWorkspaceStatus(facts({ behindCount: 4, staleThresholdCommits: 5 })).severity, "warning");
}

function testNonDefaultBranchIsFlagged() {
  const status = assessWorkspaceStatus(facts({ branch: "feat/something" }));
  assert.equal(status.onDefaultBranch, false);
  assert.ok(status.warnings.some((one) => one.includes("feat/something")));
}

function testDetachedHeadHasItsOwnMessage() {
  const status = assessWorkspaceStatus(facts({ branch: "HEAD" }));
  assert.ok(status.warnings.some((one) => one.includes("detached HEAD")));
}

function testUnpushedCommitsAreFlagged() {
  const status = assessWorkspaceStatus(facts({ aheadCount: 2 }));
  assert.ok(status.warnings.some((one) => one.includes("未 push の 2 commits")));
}

function testDirtyWorktreeIsFlagged() {
  const status = assessWorkspaceStatus(facts({ dirty: true }));
  assert.ok(status.warnings.some((one) => one.includes("未コミットの変更")));
}

function testUncomparableIsNotTreatedAsClean() {
  const status = assessWorkspaceStatus(facts({ behindCount: null, aheadCount: null }));
  assert.equal(status.severity, "warning", "比較できなかったことを「問題なし」にしない");
  assert.ok(status.warnings.some((one) => one.includes("比較できませんでした")));
  assert.notEqual(status.severity, "stale", "比較不能を stale と断定もしない");
}

function testComparisonReasonIsDistinguished() {
  // 「取得に失敗した」と「意図的に比較しなかった」を取り違えない。
  const skipped = assessWorkspaceStatus(facts({
    behindCount: null, aheadCount: null,
    comparisonUnavailableReason: "CI は毎回まっさらな checkout のため比較不要",
  }));
  assert.ok(skipped.warnings.some((one) => one.includes("比較していません")));
  assert.ok(skipped.warnings.every((one) => !one.includes("fetch 失敗")));

  const failed = assessWorkspaceStatus(facts({ behindCount: null, aheadCount: null }));
  assert.ok(failed.warnings.some((one) => one.includes("fetch 失敗")));
}

function testWarningsAccumulate() {
  const status = assessWorkspaceStatus(facts({
    branch: "feat/x", behindCount: 100, aheadCount: 2, dirty: true,
  }));
  assert.equal(status.severity, "stale");
  assert.equal(status.warnings.length, 4, "全ての問題を列挙する");
}

function testFormatLine() {
  assert.equal(
    formatWorkspaceStatusLine(assessWorkspaceStatus(facts())),
    "[workspace] main@48b8b9e1 severity=ok",
  );
  const stale = formatWorkspaceStatusLine(assessWorkspaceStatus(facts({ behindCount: 1555 })));
  assert.ok(stale.includes("severity=stale") && stale.includes("1555"));
}

function testInvalidFactsFailClosed() {
  for (const [over, pattern] of [
    [{ branch: "" }, /branch must be a non-empty string/],
    [{ commit: "zzz" }, /commit must be a hex sha/],
    [{ defaultBranch: "  " }, /defaultBranch must be a non-empty string/],
    [{ behindCount: -1 }, /behindCount must be a non-negative/],
    [{ aheadCount: 1.5 }, /aheadCount must be a non-negative/],
    [{ staleThresholdCommits: 0 }, /staleThresholdCommits must be a positive/],
  ] as const) {
    assert.throws(
      () => assessWorkspaceStatus(facts(over as Partial<WorkspaceFacts>)),
      pattern,
    );
  }
}

testCleanWorkspaceIsOk();
testStaleWorkspaceIsFlagged();
testSmallLagIsWarningNotStale();
testStaleThresholdIsConfigurable();
testNonDefaultBranchIsFlagged();
testDetachedHeadHasItsOwnMessage();
testUnpushedCommitsAreFlagged();
testDirtyWorktreeIsFlagged();
testUncomparableIsNotTreatedAsClean();
testComparisonReasonIsDistinguished();
testWarningsAccumulate();
testFormatLine();
testInvalidFactsFailClosed();

console.log("pipeline-workspace-status: 全テスト成功");
