import { existsSync, readFileSync } from "node:fs";
import {
  SECURITY_MASTER_PATHS,
  buildSecurityMasterSnapshot,
  parseSecurityMasterJsonl,
  type SecurityMasterEntityRecord,
  type SecurityMasterIssue,
  type SecurityMasterRelationshipRecord,
  type SecurityMasterSnapshot,
} from "./security-master.js";
import {
  validateSecurityMasterGoverned,
} from "./security-master-hardening.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type SecurityMasterRepositoryOptions = {
  entitiesPath?: string;
  relationshipsPath?: string;
  asOf?: string;
};

export type SecurityMasterRepositoryResult = {
  issues: SecurityMasterIssue[];
  entityRecordCount: number;
  relationshipRecordCount: number;
  activeEntityCount: number;
  activeRelationshipCount: number;
  unresolvedEntityCount: number;
  unresolvedRelationshipCount: number;
  snapshot: SecurityMasterSnapshot;
};

function issue(code: string, target: string, message: string): SecurityMasterIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: SecurityMasterIssue[]): SecurityMasterIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function readStrictJsonl<T>(path: string): { records: T[]; issues: SecurityMasterIssue[] } {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue("partial_jsonl_tail", path, "final newlineがなくpartial writeの可能性があります")],
    };
  }
  try {
    return { records: parseSecurityMasterJsonl<T>(content, path), issues: [] };
  } catch (error) {
    return { records: [], issues: [issue("invalid_jsonl", path, (error as Error).message)] };
  }
}

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateInRange(date: string, from: string, to?: string): boolean {
  return date >= from && (!to || date <= to);
}

type RevisionRecord = {
  recordId: string;
  validFrom: string;
  validTo?: string;
  supersedesRecordId?: string;
};

function historicalRevisionShadowingIssues<T extends RevisionRecord>(
  records: readonly T[],
  asOf: string,
  kind: "entity" | "relationship",
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record] as const));
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  const heads = records.filter((record) => !superseded.has(record.recordId));

  for (const head of heads) {
    if (dateInRange(asOf, head.validFrom, head.validTo)) continue;
    const seen = new Set<string>();
    let current: T | undefined = head;
    while (current?.supersedesRecordId) {
      if (seen.has(current.recordId)) break;
      seen.add(current.recordId);
      const previous = byId.get(current.supersedesRecordId);
      if (!previous) break;
      if (dateInRange(asOf, previous.validFrom, previous.validTo)) {
        issues.push(issue(
          `historical_${kind}_revision_shadowed`,
          head.recordId,
          `active revision ${head.recordId} is not valid at ${asOf}, but superseded revision ${previous.recordId} is; historical snapshot would silently drop the ${kind}`,
        ));
        break;
      }
      current = previous;
    }
  }
  return issues;
}

export function validateSecurityMasterRepository(
  options: SecurityMasterRepositoryOptions = {},
): SecurityMasterRepositoryResult {
  const entitiesPath = options.entitiesPath ?? SECURITY_MASTER_PATHS.entities;
  const relationshipsPath = options.relationshipsPath ?? SECURITY_MASTER_PATHS.relationships;
  const asOf = options.asOf ?? todayJst();
  const entityRead = readStrictJsonl<SecurityMasterEntityRecord>(entitiesPath);
  const relationshipRead = readStrictJsonl<SecurityMasterRelationshipRecord>(relationshipsPath);
  const issues: SecurityMasterIssue[] = [
    ...entityRead.issues,
    ...relationshipRead.issues,
  ];
  const journalPath = `${entitiesPath}.batch-journal.json`;
  if (existsSync(journalPath)) {
    issues.push(issue(
      "incomplete_security_master_batch",
      journalPath,
      "未完了batch journalがあります。自動復旧・自動削除せず明示確認が必要です",
    ));
  }
  const schemas = {
    entity: loadCouncilSchema(SECURITY_MASTER_PATHS.entitySchema),
    relationship: loadCouncilSchema(SECURITY_MASTER_PATHS.relationshipSchema),
  };
  issues.push(...validateSecurityMasterGoverned(
    entityRead.records,
    relationshipRead.records,
    schemas,
  ));
  issues.push(
    ...historicalRevisionShadowingIssues(entityRead.records, asOf, "entity"),
    ...historicalRevisionShadowingIssues(relationshipRead.records, asOf, "relationship"),
  );
  const snapshot = buildSecurityMasterSnapshot(
    entityRead.records,
    relationshipRead.records,
    asOf,
  );
  return {
    issues: sortIssues(issues),
    entityRecordCount: entityRead.records.length,
    relationshipRecordCount: relationshipRead.records.length,
    activeEntityCount: snapshot.entities.length,
    activeRelationshipCount: snapshot.relationships.length,
    unresolvedEntityCount: snapshot.entities.filter((record) =>
      record.status === "unknown" ||
      record.identifiers.some((identifier) => identifier.confidence === "unresolved"),
    ).length,
    unresolvedRelationshipCount: snapshot.relationships.filter(
      (record) => record.confidence === "unresolved",
    ).length,
    snapshot,
  };
}