import type { OpsDashboard, OpsIssue, OpsSafeOutputLike } from "./ops-dashboard.js";

interface SafeOutputReportLike extends OpsSafeOutputLike {
  scanErrors?: unknown[];
}

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;
const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);

export type SafeOutputAuditGap = "missing_report" | "scan_failure" | "invalid_report" | null;

export function safeOutputAuditGap(safeOutput: SafeOutputReportLike | null): SafeOutputAuditGap {
  if (safeOutput == null) return "missing_report";
  if (typeof safeOutput.healthStatus !== "string" || !HEALTH_STATUSES.has(safeOutput.healthStatus)) {
    return "invalid_report";
  }

  const findingsCount = typeof safeOutput.findingsCount === "number" && Number.isFinite(safeOutput.findingsCount)
    ? safeOutput.findingsCount
    : Array.isArray(safeOutput.findings)
      ? safeOutput.findings.length
      : 0;
  const scanErrorCount = Array.isArray(safeOutput.scanErrors) ? safeOutput.scanErrors.length : 0;

  if (safeOutput.healthStatus === "action_required") {
    return scanErrorCount > 0 ? "scan_failure" : "invalid_report";
  }
  if (safeOutput.healthStatus === "needs_attention" && findingsCount <= 0) return "invalid_report";
  if (safeOutput.healthStatus === "ok" && (findingsCount > 0 || scanErrorCount > 0)) return "invalid_report";
  return null;
}

export function applySafeOutputAuditHealth(
  dashboard: OpsDashboard,
  safeOutput: SafeOutputReportLike | null,
): OpsDashboard {
  const gap = safeOutputAuditGap(safeOutput);
  if (!gap) return dashboard;

  const count = gap === "scan_failure" ? safeOutput!.scanErrors!.length : 1;
  const issue: OpsIssue = {
    severity: "attention",
    category: "safe_wording",
    title: gap === "scan_failure"
      ? `Safe Output 監査の読み込み失敗: ${count}件`
      : gap === "invalid_report"
        ? "Safe Output 監査レポートの状態が不整合"
        : "Safe Output 監査レポートが利用できない",
    detail: gap === "scan_failure"
      ? "監査対象を読み込めず、安全表現監査が完了していません。reports/safe-output-audit.md を確認してください。"
      : gap === "invalid_report"
        ? "reports/safe-output-audit.json のhealthStatusと監査結果が整合しないため、安全表現監査の完了を確認できません。"
        : "reports/safe-output-audit.json がないか壊れているため、安全表現監査の完了を確認できません。",
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