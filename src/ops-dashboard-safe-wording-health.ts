import type { OpsDashboard, OpsIssue } from "./ops-dashboard.js";

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;

export interface SafeWordingScanHealth {
  readErrorCount: number;
}

export function applySafeWordingScanHealth(
  dashboard: OpsDashboard,
  scan: SafeWordingScanHealth,
): OpsDashboard {
  if (!Number.isInteger(scan.readErrorCount) || scan.readErrorCount <= 0) return dashboard;

  const issue: OpsIssue = {
    severity: "attention",
    category: "safe_wording",
    title: `Safe Wording 監査の読み込み失敗: ${scan.readErrorCount}件`,
    detail: "生成物の一部を読み込めず、安全表現監査が完了していません。対象生成物を再生成してから再監査してください。",
    command: "pnpm report:ops",
  };
  const allIssues = [...dashboard.allIssues, issue]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const healthStatus = allIssues.some(item => item.severity === "urgent")
    ? "action_required"
    : allIssues.some(item => item.severity === "attention")
      ? "needs_attention"
      : "ok";
  const priorityIssues = allIssues.slice(0, 5).map((item, index) => ({ ...item, rank: index + 1 }));
  const nextSafeCommands = dashboard.nextSafeCommands.some(item => item.command === issue.command)
    ? dashboard.nextSafeCommands
    : [{ command: issue.command!, reason: issue.title }, ...dashboard.nextSafeCommands];

  return {
    ...dashboard,
    healthStatus,
    allIssues,
    priorityIssues,
    nextSafeCommands,
  };
}
