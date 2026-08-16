import type { OpsDashboard, OpsIssue, OpsIntegrityLike } from "./ops-dashboard.js";

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;

export function applyOutcomeIntegrityAuditHealth(
  dashboard: OpsDashboard,
  integrity: OpsIntegrityLike | null,
): OpsDashboard {
  if (integrity != null) return dashboard;

  const issue: OpsIssue = {
    severity: "attention",
    category: "integrity",
    title: "Outcome Integrity 監査レポートが利用できない",
    detail: "reports/hypothesis_outcome_integrity_latest.json がないか壊れているため、Outcome整合性監査の完了を確認できません。",
    command: "pnpm outcomes:integrity",
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
