import type { OpsDashboard, OpsIssue, OpsWorldImpactAuditLike } from "./ops-dashboard.js";

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;

type WorldImpactAuditReportLike = OpsWorldImpactAuditLike & { generatedAt?: unknown };

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function applyWorldImpactAuditHealth(
  dashboard: OpsDashboard,
  worldImpact: OpsWorldImpactAuditLike | null,
): OpsDashboard {
  const report = worldImpact as WorldImpactAuditReportLike | null;
  const staleOrMissingCurrentEvidence = report?.healthStatus === "ok"
    && (!isStrictGregorianDate(report.generatedAt) || report.generatedAt !== dashboard.generatedAt);
  const desiredSeverity = worldImpact?.healthStatus === "action_required"
    ? "urgent"
    : worldImpact?.healthStatus === "needs_attention" || staleOrMissingCurrentEvidence
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
    title: staleOrMissingCurrentEvidence
      ? "World Impact 監査: current evidence を確認できない"
      : `World Impact 監査: ${worldImpact!.healthStatus}`,
    detail: staleOrMissingCurrentEvidence
      ? "reports/world-impact-audit.json の generatedAt が本日分ではないため、現在の監査結果として扱いません。"
      : "World Impact audit が確認または対応を要求しています。producer の healthStatus を read-only Ops Dashboard でも保持します。",
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
