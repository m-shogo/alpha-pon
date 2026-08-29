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
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "./iso-instant.js";
import { isValidDate } from "./schema.js";
import { loadCouncilSchema } from "./stock-pro-council-v2-validation.js";

export type SecurityMasterRepositoryOptions = {
  entitiesPath?: string;
  relationshipsPath?: string;
  asOf?: string;
  cutoffInstant?: string;
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
  retrievedAt: string;
  supersedesRecordId?: string;
};

function availableBy(record: RevisionRecord, cutoffInstant: string): boolean {
  try {
    if (compareExplicitIso8601Instants(
      record.retrievedAt,
      record.observedAt,
      `security master revision ${record.recordId}.retrievedAt`,
      `security master revision ${record.recordId}.observedAt`,
    ) < 0) {
      return false;
    }
    return compareExplicitIso8601Instants(
      record.observedAt,
      cutoffInstant,
      `security master revision ${record.recordId}.observedAt`,
      "security master snapshot cutoff",
    ) <= 0 && compareExplicitIso8601Instants(
      record.retrievedAt,
      cutoffInstant,
      `security master revision ${record.recordId}.retrievedAt`,
      "security master snapshot cutoff",
    ) <= 0;
  } catch {
    return false;
  }
}

function historicalRevisionShadowingIssues<T extends RevisionRecord>(
  records: readonly T[],
  asOf: string,
  cutoffInstant: string,
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
        availableBy(previous, cutoffInstant)
      ) {
        issues.push(issue(
          `historical_${kind}_revision_shadowed`,
          head.recordId,
          `active revision ${head.recordId} is not valid at ${asOf}, but superseded revision ${previous.recordId} was already available and valid; historical snapshot would silently drop the ${kind}`,
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
  cutoffInstant: string,
  kind: "entity" | "relationship",
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record] as const));
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  const heads = records.filter((record) => !superseded.has(record.recordId));

  for (const head of heads) {
    if (!dateInRange(asOf, head.validFrom, head.validTo) || availableBy(head, cutoffInstant)) continue;
    const seen = new Set<string>();
    let current: T | undefined = head;
    while (current?.supersedesRecordId) {
      if (seen.has(current.recordId)) break;
      seen.add(current.recordId);
      const previous = byId.get(current.supersedesRecordId);
      if (!previous) break;
      if (
        dateInRange(asOf, previous.validFrom, previous.validTo) &&
        availableBy(previous, cutoffInstant)
      ) {
        issues.push(issue(
          `future_${kind}_revision_shadowed`,
          head.recordId,
          `revision ${head.recordId} was not fully available by ${asOf}, but superseded revision ${previous.recordId} was; past PIT snapshot must not use future retrieval knowledge`,
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
  cutoffInstant: string,
): T[] {
  return records.filter((record) =>
    dateInRange(asOf, record.validFrom, record.validTo) && availableBy(record, cutoffInstant),
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

function enforceSnapshotOwnershipInverse(snapshot: SecurityMasterSnapshot): {
  snapshot: SecurityMasterSnapshot;
  issues: SecurityMasterIssue[];
} {
  const verifiedParentKeys = new Set(
    snapshot.relationships
      .filter((record) => record.relationshipType === "parent_of" && record.confidence === "verified")
      .map((record) => `${record.fromEntityId}->${record.toEntityId}:${record.validFrom}:${record.validTo ?? "*"}`),
  );
  const issues: SecurityMasterIssue[] = [];
  const relationships = snapshot.relationships.filter((record) => {
    if (record.relationshipType !== "subsidiary_of" || record.confidence !== "verified") return true;
    const inverse = `${record.toEntityId}->${record.fromEntityId}:${record.validFrom}:${record.validTo ?? "*"}`;
    if (verifiedParentKeys.has(inverse)) return true;
    issues.push(issue(
      "snapshot_missing_parent_of_inverse",
      `${record.relationshipId}:${record.recordId}`,
      `verified subsidiary_of is effective at ${snapshot.asOf}, but matching parent_of inverse is absent from the same PIT snapshot`,
    ));
    return false;
  });
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

  let cutoffInstant = validAsOf ? `${asOf}T23:59:59.999999999+09:00` : "";
  let validCutoffInstant = validAsOf;
  if (validAsOf && options.cutoffInstant !== undefined) {
    try {
      parseExplicitIso8601Instant(options.cutoffInstant, "security master cutoffInstant");
      const dayStart = `${asOf}T00:00:00+09:00`;
      const dayEnd = `${asOf}T23:59:59.999999999+09:00`;
      if (
        compareExplicitIso8601Instants(options.cutoffInstant, dayStart) < 0 ||
        compareExplicitIso8601Instants(options.cutoffInstant, dayEnd) > 0
      ) {
        throw new Error(`security master cutoffInstant must fall within JST date ${asOf}`);
      }
      cutoffInstant = options.cutoffInstant;
    } catch (error) {
      validCutoffInstant = false;
      issues.push(issue(
        "invalid_security_master_cutoff_instant",
        "cutoffInstant",
        (error as Error).message,
      ));
    }
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
  const snapshotBlockedByValidation = issues.some(
    (item) => item.severity === "error" &&
      ["invalid_content_hash", "invalid_official_url"].includes(item.code),
  );
  const orphanedEntityRevisionIds = new Set(
    issues
      .filter((item) => item.severity === "error" && item.code === "missing_entity_revision_parent")
      .map((item) => item.target),
  );
  const orphanedRelationshipRevisionIds = new Set(
    issues
      .filter((item) => item.severity === "error" && item.code === "missing_relationship_revision_parent")
      .map((item) => item.target),
  );
  const identityMismatchEntityRevisionIds = new Set(
    issues
      .filter((item) => item.severity === "error" && item.code === "entity_revision_identity_mismatch")
      .map((item) => item.target),
  );
  const identityMismatchRelationshipRevisionIds = new Set(
    issues
      .filter((item) => item.severity === "error" && item.code === "relationship_revision_identity_mismatch")
      .map((item) => item.target),
  );
  const nonMonotonicEntityRevisionIds = new Set(
    issues
      .filter((item) => item.severity === "error" && [
        "entity_revision_time_not_monotonic",
        "entity_revision_retrieval_not_monotonic",
      ].includes(item.code))
      .map((item) => item.target),
  );
  const nonMonotonicRelationshipRevisionIds = new Set(
    issues
      .filter((item) => item.severity === "error" && [
        "relationship_revision_time_not_monotonic",
        "relationship_revision_retrieval_not_monotonic",
      ].includes(item.code))
      .map((item) => item.target),
  );
  const chronologyBlockedRelationships = new Set(
    issues
      .filter((item) => item.severity === "error" && [
        "relationship_observed_before_from_entity",
        "relationship_observed_before_to_entity",
        "relationship_retrieved_before_from_entity",
        "relationship_retrieved_before_to_entity",
      ].includes(item.code))
      .map((item) => item.target),
  );
  const ambiguousIssuerSecurityIds = new Set(
    issues
      .filter((item) => item.severity === "error" && item.code === "overlapping_verified_issuers")
      .map((item) => item.target),
  );

  let snapshot: SecurityMasterSnapshot = { asOf, entities: [], relationships: [] };
  if (validAsOf && validCutoffInstant) {
    issues.push(
      ...historicalRevisionShadowingIssues(entityRead.records, asOf, cutoffInstant, "entity"),
      ...historicalRevisionShadowingIssues(relationshipRead.records, asOf, cutoffInstant, "relationship"),
      ...futureRevisionShadowingIssues(entityRead.records, asOf, cutoffInstant, "entity"),
      ...futureRevisionShadowingIssues(relationshipRead.records, asOf, cutoffInstant, "relationship"),
    );
    if (!snapshotBlockedByValidation) {
      const rawSnapshot = buildSecurityMasterSnapshot(
        recordsAvailableAt(entityRead.records, asOf, cutoffInstant).filter(
          (record) =>
            !orphanedEntityRevisionIds.has(record.recordId) &&
            !identityMismatchEntityRevisionIds.has(record.recordId) &&
            !nonMonotonicEntityRevisionIds.has(record.recordId),
        ),
        recordsAvailableAt(relationshipRead.records, asOf, cutoffInstant).filter(
          (record) =>
            !orphanedRelationshipRevisionIds.has(record.recordId) &&
            !identityMismatchRelationshipRevisionIds.has(record.recordId) &&
            !nonMonotonicRelationshipRevisionIds.has(record.recordId) &&
            !chronologyBlockedRelationships.has(`${record.relationshipId}:${record.recordId}`) &&
            !(
              record.relationshipType === "issuer_of" &&
              record.confidence === "verified" &&
              ambiguousIssuerSecurityIds.has(record.toEntityId)
            ),
        ),
        asOf,
      );
      const endpointIntegrity = enforceSnapshotEndpointIntegrity(rawSnapshot);
      const ownershipIntegrity = enforceSnapshotOwnershipInverse(endpointIntegrity.snapshot);
      issues.push(...endpointIntegrity.issues, ...ownershipIntegrity.issues);
      snapshot = ownershipIntegrity.snapshot;
    }
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
