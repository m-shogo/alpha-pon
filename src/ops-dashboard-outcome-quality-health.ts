import type { OpsDashboard, OpsIssue, OpsOutcomeQualityLike } from "./ops-dashboard.js";

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;

export function applyOutcomeQualityAuditHealth(
  dashboard: OpsDashboard,
  outcomeQuality: OpsOutcomeQualityLike | null,
): OpsDashboard {
  const healthStatus = outcomeQuality?.healthStatus;
  if (healthStatus !== "action_required" && healthStatus !== "needs_attention") {
    return dashboard;
  }

  const severity = healthStatus === "action_required" ? "urgent" : "attention";
  const alreadyRepresented = dashboard.allIssues.some(issue => {
    if (issue.category !== "outcome_quality") return false;
    if (healthStatus === "action_required") return issue.severity === "urgent";
    return issue.severity === "urgent" || issue.severity === "attention";
  });
  if (alreadyRepresented) return dashboard;

  const issue: OpsIssue = {
    severity,
    category: "outcome_quality",
    title: `仮説レビュー品質監査: ${healthStatus}`,
    detail: "reports/outcome-quality-audit.json が非OK状態です。個別check件数が0でもproducerのhealthStatusを運用判断から落とさないでください。",
    command: "pnpm audit:outcomes",
  };
  const allIssues = [...dashboard.allIssues, issue]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const nextHealthStatus = allIssues.some(item => item.severity === "urgent")
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
    healthStatus: nextHealthStatus,
    allIssues,
    priorityIssues,
    nextSafeCommands,
  };
}
