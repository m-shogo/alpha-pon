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
import { parseExplicitIso8601Instant } from "./iso-instant.js";
import { isValidDate } from "./schema.js";
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
  observedAt: string;
  supersedesRecordId?: string;
};

function observedBy(record: RevisionRecord, cutoffEpoch: number): boolean {
  try {
    return parseExplicitIso8601Instant(
      record.observedAt,
      `security master revision ${record.recordId}.observedAt`,
    ) <= cutoffEpoch;
  } catch {
    return false;
  }
}

function historicalRevisionShadowingIssues<T extends RevisionRecord>(
  records: readonly T[],
  asOf: string,
  cutoffEpoch: number,
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
      if (
        dateInRange(asOf, previous.validFrom, previous.validTo) &&
        observedBy(previous, cutoffEpoch)
      ) {
        issues.push(issue(
          `historical_${kind}_revision_shadowed`,
          head.recordId,
          `active revision ${head.recordId} is not valid at ${asOf}, but superseded revision ${previous.recordId} was already known and valid; historical snapshot would silently drop the ${kind}`,
        ));
        break;
      }
      current = previous;
    }
  }
  return issues;
}

function futureRevisionShadowingIssues<T extends RevisionRecord>(
  records: readonly T[],
  asOf: string,
  cutoffEpoch: number,
  kind: "entity" | "relationship",
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record] as const));
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  const heads = records.filter((record) => !superseded.has(record.recordId));

  for (const head of heads) {
    if (!dateInRange(asOf, head.validFrom, head.validTo) || observedBy(head, cutoffEpoch)) continue;
    const seen = new Set<string>();
    let current: T | undefined = head;
    while (current?.supersedesRecordId) {
      if (seen.has(current.recordId)) break;
      seen.add(current.recordId);
      const previous = byId.get(current.supersedesRecordId);
      if (!previous) break;
      if (
        dateInRange(asOf, previous.validFrom, previous.validTo) &&
        observedBy(previous, cutoffEpoch)
      ) {
        issues.push(issue(
          `future_${kind}_revision_shadowed`,
          head.recordId,
          `revision ${head.recordId} was not observed by ${asOf}, but superseded revision ${previous.recordId} was; past PIT snapshot must not use future identity knowledge`,
        ));
        break;
      }
      current = previous;
    }
  }
  return issues;
}

function recordsAvailableAt<T extends RevisionRecord>(
  records: readonly T[],
  asOf: string,
  cutoffEpoch: number,
): T[] {
  return records.filter((record) =>
    dateInRange(asOf, record.validFrom, record.validTo) && observedBy(record, cutoffEpoch),
  );
}

function enforceSnapshotEndpointIntegrity(snapshot: SecurityMasterSnapshot): {
  snapshot: SecurityMasterSnapshot;
  issues: SecurityMasterIssue[];
} {
  const entityIds = new Set(snapshot.entities.map((entity) => entity.entityId));
  const issues: SecurityMasterIssue[] = [];
  const relationships: SecurityMasterRelationshipRecord[] = [];

  for (const relationship of snapshot.relationships) {
    const missingFrom = !entityIds.has(relationship.fromEntityId);
    const missingTo = !entityIds.has(relationship.toEntityId);
    const target = `${relationship.relationshipId}:${relationship.recordId}`;
    if (missingFrom) {
      issues.push(issue(
        "snapshot_relationship_missing_from_entity",
        target,
        `relationship is effective at ${snapshot.asOf}, but fromEntityId ${relationship.fromEntityId} is not effective in the same snapshot`,
      ));
    }
    if (missingTo) {
      issues.push(issue(
        "snapshot_relationship_missing_to_entity",
        target,
        `relationship is effective at ${snapshot.asOf}, but toEntityId ${relationship.toEntityId} is not effective in the same snapshot`,
      ));
    }
    if (!missingFrom && !missingTo) relationships.push(relationship);
  }

  return {
    snapshot: { ...snapshot, relationships },
    issues,
  };
}

export function validateSecurityMasterRepository(
  options: SecurityMasterRepositoryOptions = {},
): SecurityMasterRepositoryResult {
  const entitiesPath = options.entitiesPath ?? SECURITY_MASTER_PATHS.entities;
  const relationshipsPath = options.relationshipsPath ?? SECURITY_MASTER_PATHS.relationships;
  const asOf = options.asOf ?? todayJst();
  const validAsOf = isValidDate(asOf);
  const entityRead = readStrictJsonl<SecurityMasterEntityRecord>(entitiesPath);
  const relationshipRead = readStrictJsonl<SecurityMasterRelationshipRecord>(relationshipsPath);
  const issues: SecurityMasterIssue[] = [
    ...entityRead.issues,
    ...relationshipRead.issues,
  ];
  if (!validAsOf) {
    issues.push(issue(
      "invalid_security_master_as_of",
      "asOf",
      `${asOf} is not an exact Gregorian YYYY-MM-DD date`,
    ));
  }
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

  let snapshot: SecurityMasterSnapshot = { asOf, entities: [], relationships: [] };
  if (validAsOf) {
    const cutoffEpoch = parseExplicitIso8601Instant(
      `${asOf}T23:59:59.999+09:00`,
      "security master snapshot cutoff",
    );
    issues.push(
      ...historicalRevisionShadowingIssues(entityRead.records, asOf, cutoffEpoch, "entity"),
      ...historicalRevisionShadowingIssues(relationshipRead.records, asOf, cutoffEpoch, "relationship"),
      ...futureRevisionShadowingIssues(entityRead.records, asOf, cutoffEpoch, "entity"),
      ...futureRevisionShadowingIssues(relationshipRead.records, asOf, cutoffEpoch, "relationship"),
    );
    const rawSnapshot = buildSecurityMasterSnapshot(
      recordsAvailableAt(entityRead.records, asOf, cutoffEpoch),
      recordsAvailableAt(relationshipRead.records, asOf, cutoffEpoch),
      asOf,
    );
    const endpointIntegrity = enforceSnapshotEndpointIntegrity(rawSnapshot);
    issues.push(...endpointIntegrity.issues);
    snapshot = endpointIntegrity.snapshot;
  }

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
