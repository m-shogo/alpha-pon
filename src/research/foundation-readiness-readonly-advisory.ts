import { relative, resolve, sep } from "node:path";

export type FoundationReadinessReadOnlyFollowUp = {
  purpose: "foundation_readiness_remediation_plan";
  command: string;
  foundationGateStillPending: true;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function toRepositoryRelativePath(path: string, cwd: string): string {
  const resolvedCwd = resolve(cwd);
  const resolvedPath = resolve(path);
  const value = relative(resolvedCwd, resolvedPath).split(sep).join("/");
  if (!value || value === ".." || value.startsWith("../") || value.startsWith("/")) {
    throw new Error("readiness audit path must remain inside the repository");
  }
  if (!value.startsWith("data/edinet/")) {
    throw new Error("readiness audit path must remain under data/edinet");
  }
  if (!/\/configured-foundation-readiness-audit-v1\.[A-Za-z0-9_-]+\.json$/.test(value)) {
    throw new Error("readiness audit filename is invalid");
  }
  return value;
}

export function buildFoundationReadinessReadOnlyFollowUp(
  auditPath: string,
  cwd = process.cwd(),
): FoundationReadinessReadOnlyFollowUp {
  const relativeAuditPath = toRepositoryRelativePath(auditPath, cwd);
  return {
    purpose: "foundation_readiness_remediation_plan",
    command: [
      "bash scripts/run-foundation-readiness-remediation-plan-local.sh \\",
      `  --audit ${shellQuote(relativeAuditPath)} \\`,
      "  --execute-remediation-plan",
    ].join("\n"),
    foundationGateStillPending: true,
  };
}
