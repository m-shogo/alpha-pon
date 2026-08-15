import { resolveWorldImpactReportInput } from "./world-impact-report-input.js";

export function countInvalidWorldImpactAuditRows(rawRecords: unknown[], today: string): number {
  return rawRecords.filter(record =>
    resolveWorldImpactReportInput({ present: true, parsed: [record] }, [], today).latestSnapshotError
  ).length;
}
