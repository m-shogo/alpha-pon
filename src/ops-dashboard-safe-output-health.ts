import type { OpsDashboard, OpsIssue, OpsSafeOutputLike } from "./ops-dashboard.js";

interface SafeOutputReportLike extends OpsSafeOutputLike {
  scanErrors?: unknown[];
}

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;

export function applySafeOutputAuditHealth(
  dashboard: OpsDashboard,
  safeOutput: SafeOutputReportLike | null,
): OpsDashboard {
  const hasScanFailure =
    safeOutput?.healthStatus === "action_required"
    && (safeOutput.findingsCount ?? safeOutput.findings?.length ?? 0) === 0
    && Array.isArray(safeOutput.scanErrors)
    && safeOutput.scanErrors.length > 0;

  if (!hasScanFailure) return dashboard;

  const issue: OpsIssue = {
    severity: "attention",
    category: "safe_wording",
    title: `Safe Output 監査の読み込み失敗: ${safeOutput.scanErrors!.length}件`,
    detail: "監査対象を読み込めず、安全表現監査が完了していません。reports/safe-output-audit.md を確認してください。",
    command: "pnpm audit:safe-output",
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
