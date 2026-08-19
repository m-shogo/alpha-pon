import type { OpsDashboard, OpsIssue, OpsSafeOutputLike } from "./ops-dashboard.js";

interface SafeOutputReportLike extends OpsSafeOutputLike {
  generatedAt?: unknown;
  scanErrors?: unknown;
}

const SEVERITY_RANK = { urgent: 0, attention: 1, info: 2 } as const;
const HEALTH_STATUSES = new Set(["ok", "needs_attention", "action_required"]);

export type SafeOutputAuditGap = "missing_report" | "scan_failure" | "invalid_report" | null;

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function safeOutputAuditGap(
  safeOutput: SafeOutputReportLike | null,
  expectedDate?: string,
): SafeOutputAuditGap {
  if (safeOutput == null) return "missing_report";
  if (typeof safeOutput.healthStatus !== "string" || !HEALTH_STATUSES.has(safeOutput.healthStatus)) {
    return "invalid_report";
  }
  if (expectedDate !== undefined) {
    if (!isStrictGregorianDate(safeOutput.generatedAt) || safeOutput.generatedAt !== expectedDate) {
      return "invalid_report";
    }
  }
  if (
    safeOutput.scannedFiles !== undefined
    && (!Number.isSafeInteger(safeOutput.scannedFiles) || safeOutput.scannedFiles < 0)
  ) {
    return "invalid_report";
  }
  if (
    safeOutput.findingsCount !== undefined
    && (!Number.isSafeInteger(safeOutput.findingsCount) || safeOutput.findingsCount < 0)
  ) {
    return "invalid_report";
  }
  if (safeOutput.findings !== undefined && !Array.isArray(safeOutput.findings)) {
    return "invalid_report";
  }
  if (
    safeOutput.findingsCount !== undefined
    && Array.isArray(safeOutput.findings)
    && safeOutput.findingsCount !== safeOutput.findings.length
  ) {
    return "invalid_report";
  }
  if (safeOutput.scanErrors !== undefined && !Array.isArray(safeOutput.scanErrors)) {
    return "invalid_report";
  }

  const findingsCount = typeof safeOutput.findingsCount === "number" && Number.isFinite(safeOutput.findingsCount)
    ? safeOutput.findingsCount
    : Array.isArray(safeOutput.findings)
      ? safeOutput.findings.length
      : 0;
  const scanErrorCount = Array.isArray(safeOutput.scanErrors) ? safeOutput.scanErrors.length : 0;

  // findings がある場合は buildOpsDashboard 側の既存危険表現 issue に任せる。
  // この helper は findings 0件なのに監査完了を証明できないケースだけを補完する。
  if (findingsCount > 0) return null;

  if (safeOutput.healthStatus === "action_required") {
    return scanErrorCount > 0 ? "scan_failure" : "invalid_report";
  }
  if (safeOutput.healthStatus === "needs_attention") return "invalid_report";
  if (safeOutput.healthStatus === "ok" && scanErrorCount > 0) return "invalid_report";
  return null;
}

export function applySafeOutputAuditHealth(
  dashboard: OpsDashboard,
  safeOutput: SafeOutputReportLike | null,
): OpsDashboard {
  const gap = safeOutputAuditGap(safeOutput, dashboard.generatedAt);
  if (!gap) return dashboard;

  const count = gap === "scan_failure" && Array.isArray(safeOutput?.scanErrors)
    ? safeOutput.scanErrors.length
    : 1;
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
