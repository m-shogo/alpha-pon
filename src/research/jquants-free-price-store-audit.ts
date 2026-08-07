import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
  parsePriceJsonl,
  type MissingPriceReason,
  type PitPriceRecord,
  type PriceRecordStatus,
  type PriceStoreIssue,
} from "./price-store.js";
import { validateHardenedPriceRecords } from "./price-store-hardening.js";
import type { JsonSchema } from "./schema.js";

export const JQUANTS_FREE_AUDIT_MAX_FILES = 128;
export const JQUANTS_FREE_AUDIT_MAX_FILE_BYTES = 16 * 1024 * 1024;

export type JQuantsFreePriceStoreAuditStatus =
  | "no_local_price_files"
  | "ok"
  | "issues_found";

export type JQuantsFreeSeriesAudit = {
  seriesKind: PitPriceRecord["seriesKind"];
  market: string;
  code: string;
  source: string;
  providerPlan: PitPriceRecord["providerPlan"];
  recordCount: number;
  revisionCount: number;
  earliestTradingDate: string;
  latestTradingDate: string;
  statusCounts: Record<PriceRecordStatus, number>;
  missingReasonCounts: Partial<Record<MissingPriceReason, number>>;
};

export type JQuantsFreePriceStoreAuditReport = {
  schemaVersion: 1;
  status: JQuantsFreePriceStoreAuditStatus;
  fileCount: number;
  recordCount: number;
  seriesCount: number;
  errorCount: number;
  warningCount: number;
  issueCounts: Record<string, number>;
  filesystemIssueCounts: Record<string, number>;
  statusCounts: Record<PriceRecordStatus, number>;
  missingReasonCounts: Partial<Record<MissingPriceReason, number>>;
  unknownMissingCount: number;
  series: JQuantsFreeSeriesAudit[];
  ignoredEntryCount: number;
  rawValuesIncluded: false;
  rawLinesIncluded: false;
  absolutePathsIncluded: false;
  automaticTradingAuthorized: false;
};

type AuditFilesystemIssue = {
  code: string;
  entry: string;
};

function emptyStatusCounts(): Record<PriceRecordStatus, number> {
  return { traded: 0, suspended: 0, no_trade: 0, missing: 0 };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function seriesKey(record: PitPriceRecord): string {
  return [
    record.seriesKind,
    record.market,
    record.code,
    record.source,
    record.providerPlan,
  ].join("|");
}

function summarizeSeries(records: readonly PitPriceRecord[]): JQuantsFreeSeriesAudit[] {
  const groups = new Map<string, PitPriceRecord[]>();
  for (const record of records) {
    const key = seriesKey(record);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const sorted = [...group].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
      const first = sorted[0]!;
      const statusCounts = emptyStatusCounts();
      const missingReasonCounts: Partial<Record<MissingPriceReason, number>> = {};
      for (const record of sorted) {
        statusCounts[record.status] += 1;
        if (record.missingReason) {
          missingReasonCounts[record.missingReason] = (missingReasonCounts[record.missingReason] ?? 0) + 1;
        }
      }
      return {
        seriesKind: first.seriesKind,
        market: first.market,
        code: first.code,
        source: first.source,
        providerPlan: first.providerPlan,
        recordCount: sorted.length,
        revisionCount: sorted.filter((record) => Boolean(record.supersedesHash)).length,
        earliestTradingDate: sorted[0]!.tradingDate,
        latestTradingDate: sorted.at(-1)!.tradingDate,
        statusCounts,
        missingReasonCounts,
      };
    })
    .sort((left, right) =>
      `${left.seriesKind}|${left.market}|${left.code}|${left.source}|${left.providerPlan}`.localeCompare(
        `${right.seriesKind}|${right.market}|${right.code}|${right.source}|${right.providerPlan}`,
      ),
    );
}

export function summarizeJQuantsFreePriceStoreAudit(input: {
  records: readonly PitPriceRecord[];
  issues: readonly PriceStoreIssue[];
  filesystemIssues?: readonly AuditFilesystemIssue[];
  fileCount: number;
  ignoredEntryCount?: number;
}): JQuantsFreePriceStoreAuditReport {
  const statusCounts = emptyStatusCounts();
  const missingReasonCounts: Partial<Record<MissingPriceReason, number>> = {};
  for (const record of input.records) {
    statusCounts[record.status] += 1;
    if (record.missingReason) {
      missingReasonCounts[record.missingReason] = (missingReasonCounts[record.missingReason] ?? 0) + 1;
    }
  }

  const issueCounts: Record<string, number> = {};
  let errorCount = 0;
  let warningCount = 0;
  for (const item of input.issues) {
    increment(issueCounts, item.code);
    if (item.severity === "error") errorCount += 1;
    else warningCount += 1;
  }

  const filesystemIssueCounts: Record<string, number> = {};
  for (const item of input.filesystemIssues ?? []) increment(filesystemIssueCounts, item.code);
  errorCount += (input.filesystemIssues ?? []).length;

  const status: JQuantsFreePriceStoreAuditStatus = errorCount > 0
    ? "issues_found"
    : input.fileCount === 0
      ? "no_local_price_files"
      : "ok";

  const series = summarizeSeries(input.records);
  return {
    schemaVersion: 1,
    status,
    fileCount: input.fileCount,
    recordCount: input.records.length,
    seriesCount: series.length,
    errorCount,
    warningCount,
    issueCounts,
    filesystemIssueCounts,
    statusCounts,
    missingReasonCounts,
    unknownMissingCount: missingReasonCounts.unknown ?? 0,
    series,
    ignoredEntryCount: input.ignoredEntryCount ?? 0,
    rawValuesIncluded: false,
    rawLinesIncluded: false,
    absolutePathsIncluded: false,
    automaticTradingAuthorized: false,
  };
}

export function auditJQuantsFreePriceStore(input: {
  root: string;
  schema: JsonSchema;
  now?: Date;
}): JQuantsFreePriceStoreAuditReport {
  if (!existsSync(input.root)) {
    return summarizeJQuantsFreePriceStoreAudit({ records: [], issues: [], fileCount: 0 });
  }

  const rootStat = lstatSync(input.root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    return summarizeJQuantsFreePriceStoreAudit({
      records: [],
      issues: [],
      filesystemIssues: [{ code: "unsafe_root", entry: basename(input.root) }],
      fileCount: 0,
    });
  }

  const entries = readdirSync(input.root, { withFileTypes: true });
  const jsonlEntries = entries.filter((entry) => entry.name.endsWith(".jsonl"));
  const filesystemIssues: AuditFilesystemIssue[] = [];
  let ignoredEntryCount = 0;
  for (const entry of entries) {
    if (entry.name.endsWith(".jsonl")) continue;
    if (entry.isDirectory()) {
      filesystemIssues.push({ code: "unexpected_nested_entry", entry: entry.name });
      continue;
    }
    if (entry.isSymbolicLink()) {
      filesystemIssues.push({ code: "unsafe_non_price_symlink", entry: entry.name });
      continue;
    }
    ignoredEntryCount += 1;
  }

  const records: PitPriceRecord[] = [];
  let fileCount = 0;

  if (jsonlEntries.length > JQUANTS_FREE_AUDIT_MAX_FILES) {
    filesystemIssues.push({ code: "too_many_price_files", entry: "<root>" });
  }

  for (const entry of jsonlEntries.slice(0, JQUANTS_FREE_AUDIT_MAX_FILES)) {
    const safeName = entry.name;
    const path = join(input.root, safeName);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      filesystemIssues.push({ code: "unsafe_price_file", entry: safeName });
      continue;
    }
    if (stat.nlink !== 1) {
      filesystemIssues.push({ code: "hard_linked_price_file", entry: safeName });
      continue;
    }
    if (stat.size > JQUANTS_FREE_AUDIT_MAX_FILE_BYTES) {
      filesystemIssues.push({ code: "oversized_price_file", entry: safeName });
      continue;
    }

    fileCount += 1;
    try {
      records.push(...parsePriceJsonl(readFileSync(path, "utf-8"), safeName));
    } catch {
      filesystemIssues.push({ code: "invalid_price_jsonl", entry: safeName });
    }
  }

  const issues = validateHardenedPriceRecords(
    records,
    input.schema,
    input.now ?? new Date(),
  );

  return summarizeJQuantsFreePriceStoreAudit({
    records,
    issues,
    filesystemIssues,
    fileCount,
    ignoredEntryCount,
  });
}
