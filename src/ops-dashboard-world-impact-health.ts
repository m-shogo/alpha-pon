import type { OpsDashboard, OpsIssue, OpsWorldImpactAuditLike } from "./ops-dashboard.js";

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;

export function applyWorldImpactAuditHealth(
  dashboard: OpsDashboard,
  worldImpact: OpsWorldImpactAuditLike | null,
): OpsDashboard {
  const desiredSeverity = worldImpact?.healthStatus === "action_required"
    ? "urgent"
    : worldImpact?.healthStatus === "needs_attention"
      ? "attention"
      : null;

  if (!desiredSeverity) return dashboard;

  const alreadyRepresented = dashboard.allIssues.some(
    issue => issue.category === "world_impact" && SEVERITY_RANK[issue.severity] <= SEVERITY_RANK[desiredSeverity],
  );
  if (alreadyRepresented) return dashboard;

  const issue: OpsIssue = {
    severity: desiredSeverity,
    category: "world_impact",
    title: `World Impact 監査: ${worldImpact!.healthStatus}`,
    detail: "World Impact audit が確認または対応を要求しています。producer の healthStatus を read-only Ops Dashboard でも保持します。",
    command: "pnpm audit:world-impact",
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
