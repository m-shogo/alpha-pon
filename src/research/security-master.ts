import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";
import { isValidDate, stableStringify, validate, type JsonSchema } from "./schema.js";

export type SecurityEntityType =
  | "legal_entity"
  | "listed_security"
  | "listing"
  | "segment"
  | "brand"
  | "facility"
  | "product"
  | "official_account";

export type SecurityEntityStatus =
  | "active"
  | "inactive"
  | "merged"
  | "spun_off"
  | "delisted"
  | "unknown";

export type IdentifierConfidence = "verified" | "probable" | "unresolved";

export type SecurityIdentifier = {
  type:
    | "internal"
    | "jpx_code"
    | "ticker"
    | "isin"
    | "edinet_code"
    | "corporate_number_jp"
    | "lei"
    | "market_code"
    | "provider_code";
  value: string;
  market?: string;
  provider?: string;
  validFrom: string;
  validTo?: string;
  confidence: IdentifierConfidence;
  sourceRefs: string[];
};

export type SecurityName = {
  name: string;
  kind: "legal" | "trade" | "former" | "english" | "abbreviation" | "brand";
  language?: string;
  validFrom: string;
  validTo?: string;
  sourceRefs: string[];
};

export type OfficialLink = {
  kind: "website" | "ir" | "disclosure" | "sns" | "exchange_profile";
  url: string;
  platform?: string;
  verificationStatus: "verified_official" | "claimed" | "unknown";
  validFrom: string;
  validTo?: string;
  sourceRefs: string[];
};

export type SecurityMasterEntityRecord = {
  schemaVersion: 1;
  recordId: string;
  entityId: string;
  entityType: SecurityEntityType;
  canonicalName: string;
  jurisdiction: string;
  validFrom: string;
  validTo?: string;
  status: SecurityEntityStatus;
  names: SecurityName[];
  identifiers: SecurityIdentifier[];
  officialLinks: OfficialLink[];
  sourceRefs: string[];
  observedAt: string;
  retrievedAt: string;
  supersedesRecordId?: string;
  contentHash: string;
};

export type SecurityMasterEntityRecordInput = Omit<SecurityMasterEntityRecord, "contentHash">;

export type SecurityRelationshipType =
  | "issuer_of"
  | "listed_on"
  | "parent_of"
  | "subsidiary_of"
  | "owns_brand"
  | "operates_facility"
  | "has_segment"
  | "produces_product"
  | "official_account_of"
  | "renamed_from"
  | "ticker_changed_from"
  | "merged_into"
  | "spun_off_from";

export type SecurityMasterRelationshipRecord = {
  schemaVersion: 1;
  recordId: string;
  relationshipId: string;
  relationshipType: SecurityRelationshipType;
  fromEntityId: string;
  toEntityId: string;
  validFrom: string;
  validTo?: string;
  ownershipPct?: number;
  confidence: IdentifierConfidence;
  sourceRefs: string[];
  observedAt: string;
  retrievedAt: string;
  supersedesRecordId?: string;
  contentHash: string;
};

export type SecurityMasterRelationshipRecordInput = Omit<
  SecurityMasterRelationshipRecord,
  "contentHash"
>;

export type SecurityMasterIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type SecurityMasterSchemas = {
  entity: JsonSchema;
  relationship: JsonSchema;
};

export type SecurityMasterSnapshot = {
  asOf: string;
  entities: SecurityMasterEntityRecord[];
  relationships: SecurityMasterRelationshipRecord[];
};

export type ResolvedListedSecurityContext = {
  security: SecurityMasterEntityRecord;
  issuer: SecurityMasterEntityRecord;
  listing: SecurityMasterEntityRecord;
  issuerRelationship: SecurityMasterRelationshipRecord;
  listingRelationship: SecurityMasterRelationshipRecord;
};

export const SECURITY_MASTER_PATHS = {
  entities: "research/security_master/entities.jsonl",
  relationships: "research/security_master/relationships.jsonl",
  entitySchema: "research/schemas/security-master-entity-record.schema.json",
  relationshipSchema: "research/schemas/security-master-relationship-record.schema.json",
} as const;

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutEntityHash(
  record: SecurityMasterEntityRecord,
): SecurityMasterEntityRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutRelationshipHash(
  record: SecurityMasterRelationshipRecord,
): SecurityMasterRelationshipRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeSecurityEntityHash(
  record: SecurityMasterEntityRecord | SecurityMasterEntityRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutEntityHash(record) : record);
}

export function withSecurityEntityHash(
  record: SecurityMasterEntityRecordInput,
): SecurityMasterEntityRecord {
  return { ...record, contentHash: computeSecurityEntityHash(record) };
}

export function computeSecurityRelationshipHash(
  record: SecurityMasterRelationshipRecord | SecurityMasterRelationshipRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutRelationshipHash(record) : record);
}

export function withSecurityRelationshipHash(
  record: SecurityMasterRelationshipRecordInput,
): SecurityMasterRelationshipRecord {
  return { ...record, contentHash: computeSecurityRelationshipHash(record) };
}

function issue(
  code: string,
  target: string,
  message: string,
  severity: SecurityMasterIssue["severity"] = "error",
): SecurityMasterIssue {
  return { severity, code, target, message };
}

function sortIssues(issues: SecurityMasterIssue[]): SecurityMasterIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function schemaIssues(
  value: unknown,
  schema: JsonSchema,
  target: string,
): SecurityMasterIssue[] {
  return validate(value, schema).map((error) => issue(
    "schema_violation",
    error.path ? `${target}:${error.path}` : target,
    error.message,
  ));
}

function dateInRange(date: string, from: string, to?: string): boolean {
  return date >= from && (!to || date <= to);
}

function rangesOverlap(
  leftFrom: string,
  leftTo: string | undefined,
  rightFrom: string,
  rightTo: string | undefined,
): boolean {
  const leftEnd = leftTo ?? "9999-12-31";
  const rightEnd = rightTo ?? "9999-12-31";
  return leftFrom <= rightEnd && rightFrom <= leftEnd;
}

function validHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function identifierKey(identifier: SecurityIdentifier): string {
  return [
    identifier.type,
    identifier.value.trim().toUpperCase(),
    identifier.market?.trim().toUpperCase() ?? "*",
    identifier.provider?.trim().toLowerCase() ?? "*",
  ].join(":");
}

function activeEntityHeads(
  records: SecurityMasterEntityRecord[],
): SecurityMasterEntityRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function activeRelationshipHeads(
  records: SecurityMasterRelationshipRecord[],
): SecurityMasterRelationshipRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function validatePeriod(
  validFrom: string,
  validTo: string | undefined,
  target: string,
): SecurityMasterIssue[] {
  return validTo && validFrom > validTo
    ? [issue("invalid_validity_period", target, `${validFrom} > ${validTo}`)]
    : [];
}

export function validateSecurityEntityRecord(
  record: SecurityMasterEntityRecord,
  schema: JsonSchema,
  target = `entity:${record.entityId}:${record.recordId}`,
): SecurityMasterIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeSecurityEntityHash(record)) {
    issues.push(issue("invalid_content_hash", target, "entity contentHashが一致しません"));
  }
  if (compareExplicitIso8601Instants(record.retrievedAt, record.observedAt) < 0) {
    issues.push(issue(
      "retrieved_before_observed",
      target,
      `${record.retrievedAt} < ${record.observedAt}`,
    ));
  }
  issues.push(...validatePeriod(record.validFrom, record.validTo, target));
  for (const [index, name] of record.names.entries()) {
    issues.push(...validatePeriod(
      name.validFrom,
      name.validTo,
      `${target}.names[${index}]`,
    ));
  }
  for (const [index, identifier] of record.identifiers.entries()) {
    const idTarget = `${target}.identifiers[${index}]`;
    issues.push(...validatePeriod(identifier.validFrom, identifier.validTo, idTarget));
    if (identifier.type === "ticker" && !identifier.market?.trim()) {
      issues.push(issue("ticker_without_market", idTarget, "tickerにはmarketが必要です"));
    }
    if (identifier.type === "provider_code" && !identifier.provider?.trim()) {
      issues.push(issue(
        "provider_code_without_provider",
        idTarget,
        "provider_codeにはproviderが必要です",
      ));
    }
  }
  for (const [index, link] of record.officialLinks.entries()) {
    const linkTarget = `${target}.officialLinks[${index}]`;
    issues.push(...validatePeriod(link.validFrom, link.validTo, linkTarget));
    if (!validHttpsUrl(link.url)) {
      issues.push(issue(
        "invalid_official_url",
        linkTarget,
        "official linkはcredentialなしのHTTPS URLが必要です",
      ));
    }
    if (link.kind === "sns" && !link.platform?.trim()) {
      issues.push(issue("sns_without_platform", linkTarget, "SNS linkにはplatformが必要です"));
    }
  }

  const currentNames = record.names.filter((name) =>
    dateInRange(record.validFrom, name.validFrom, name.validTo),
  );
  if (!currentNames.some((name) => name.name === record.canonicalName)) {
    issues.push(issue(
      "canonical_name_not_in_names",
      target,
      "canonicalNameはnamesの有効なnameとして保存してください",
    ));
  }
  if (record.entityType === "listed_security") {
    const verifiedMarketIdentifier = record.identifiers.some((identifier) =>
      identifier.confidence === "verified" &&
      ["jpx_code", "ticker", "isin"].includes(identifier.type),
    );
    if (!verifiedMarketIdentifier) {
      issues.push(issue(
        "listed_security_without_verified_identifier",
        target,
        "listed_securityにはverifiedなjpx_code/ticker/isinが必要です",
      ));
    }
  }
  if (record.entityType === "listing") {
    const marketCode = record.identifiers.some((identifier) =>
      identifier.type === "market_code" && identifier.confidence === "verified",
    );
    if (!marketCode) {
      issues.push(issue(
        "listing_without_market_code",
        target,
        "listingにはverifiedなmarket_codeが必要です",
      ));
    }
  }
  if (record.status === "unknown") {
    issues.push(issue(
      "unknown_entity_status",
      target,
      "status=unknownは保存できますがRecommendationへ使用できません",
      "warning",
    ));
  }
  return sortIssues(issues);
}

const RELATIONSHIP_ENDPOINTS: Record<
  SecurityRelationshipType,
  { from: readonly SecurityEntityType[]; to: readonly SecurityEntityType[] }
> = {
  issuer_of: { from: ["legal_entity"], to: ["listed_security"] },
  listed_on: { from: ["listed_security"], to: ["listing"] },
  parent_of: { from: ["legal_entity"], to: ["legal_entity"] },
  subsidiary_of: { from: ["legal_entity"], to: ["legal_entity"] },
  owns_brand: { from: ["legal_entity"], to: ["brand"] },
  operates_facility: { from: ["legal_entity"], to: ["facility"] },
  has_segment: { from: ["legal_entity"], to: ["segment"] },
  produces_product: {
    from: ["legal_entity", "segment", "facility"],
    to: ["product"],
  },
  official_account_of: {
    from: ["official_account"],
    to: ["legal_entity", "brand"],
  },
  renamed_from: {
    from: ["legal_entity", "listed_security", "listing"],
    to: ["legal_entity", "listed_security", "listing"],
  },
  ticker_changed_from: { from: ["listed_security"], to: ["listed_security"] },
  merged_into: { from: ["legal_entity"], to: ["legal_entity"] },
  spun_off_from: { from: ["legal_entity"], to: ["legal_entity"] },
};

export function validateSecurityRelationshipRecord(
  record: SecurityMasterRelationshipRecord,
  schema: JsonSchema,
  entitiesById: Map<string, SecurityMasterEntityRecord>,
  target = `relationship:${record.relationshipId}:${record.recordId}`,
): SecurityMasterIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeSecurityRelationshipHash(record)) {
    issues.push(issue("invalid_content_hash", target, "relationship contentHashが一致しません"));
  }
  if (compareExplicitIso8601Instants(record.retrievedAt, record.observedAt) < 0) {
    issues.push(issue(
      "retrieved_before_observed",
      target,
      `${record.retrievedAt} < ${record.observedAt}`,
    ));
  }
  issues.push(...validatePeriod(record.validFrom, record.validTo, target));
  if (record.fromEntityId === record.toEntityId) {
    issues.push(issue("self_relationship", target, "自己relationshipは許可されません"));
  }

  const from = entitiesById.get(record.fromEntityId);
  const to = entitiesById.get(record.toEntityId);
  if (!from) issues.push(issue("missing_from_entity", target, record.fromEntityId));
  if (!to) issues.push(issue("missing_to_entity", target, record.toEntityId));
  if (from && to) {
    const endpoints = RELATIONSHIP_ENDPOINTS[record.relationshipType];
    if (!endpoints.from.includes(from.entityType) || !endpoints.to.includes(to.entityType)) {
      issues.push(issue(
        "relationship_endpoint_type_mismatch",
        target,
        `${record.relationshipType}: ${from.entityType} -> ${to.entityType}`,
      ));
    }
    if (
      ["renamed_from", "ticker_changed_from"].includes(record.relationshipType) &&
      from.entityType !== to.entityType
    ) {
      issues.push(issue(
        "history_relationship_type_mismatch",
        target,
        "name/ticker history relationshipは同一entity type間に限定します",
      ));
    }
  }

  const ownershipRelationship = ["parent_of", "subsidiary_of"].includes(
    record.relationshipType,
  );
  if (record.ownershipPct !== undefined && !ownershipRelationship) {
    issues.push(issue(
      "ownership_pct_on_non_ownership_relationship",
      target,
      `${record.relationshipType}にownershipPctを設定できません`,
    ));
  }
  if (record.confidence === "unresolved") {
    issues.push(issue(
      "unresolved_relationship",
      target,
      "unresolved relationshipはRecommendationへ使用できません",
      "warning",
    ));
  }
  return sortIssues(issues);
}

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
): SecurityMasterIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

function validateEntityRevisions(
  records: SecurityMasterEntityRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byRecordId = new Map(records.map((record) => [record.recordId, record]));
  for (const record of records) {
    if (!record.supersedesRecordId) continue;
    const previous = byRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue("missing_entity_revision_parent", record.recordId, record.supersedesRecordId));
      continue;
    }
    if (record.entityId !== previous.entityId || record.entityType !== previous.entityType) {
      issues.push(issue(
        "entity_revision_identity_mismatch",
        record.recordId,
        "entityId/entityTypeをrevisionで変更できません",
      ));
    }
    if (compareExplicitIso8601Instants(record.observedAt, previous.observedAt) <= 0) {
      issues.push(issue(
        "entity_revision_time_not_monotonic",
        record.recordId,
        "observedAtは直前revisionより後である必要があります",
      ));
    }
  }
  return issues;
}

function validateRelationshipRevisions(
  records: SecurityMasterRelationshipRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byRecordId = new Map(records.map((record) => [record.recordId, record]));
  for (const record of records) {
    if (!record.supersedesRecordId) continue;
    const previous = byRecordId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue(
        "missing_relationship_revision_parent",
        record.recordId,
        record.supersedesRecordId,
      ));
      continue;
    }
    if (
      record.relationshipId !== previous.relationshipId ||
      record.relationshipType !== previous.relationshipType ||
      record.fromEntityId !== previous.fromEntityId ||
      record.toEntityId !== previous.toEntityId
    ) {
      issues.push(issue(
        "relationship_revision_identity_mismatch",
        record.recordId,
        "relationship identityをrevisionで変更できません",
      ));
    }
    if (compareExplicitIso8601Instants(record.observedAt, previous.observedAt) <= 0) {
      issues.push(issue(
        "relationship_revision_time_not_monotonic",
        record.recordId,
        "observedAtは直前revisionより後である必要があります",
      ));
    }
  }
  return issues;
}

function validateIdentifierCollisions(
  records: SecurityMasterEntityRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const heads = activeEntityHeads(records);
  const index = new Map<string, Array<{
    entityId: string;
    identifier: SecurityIdentifier;
  }>>();
  for (const entity of heads) {
    for (const identifier of entity.identifiers) {
      if (identifier.confidence !== "verified") continue;
      const key = identifierKey(identifier);
      const group = index.get(key) ?? [];
      group.push({ entityId: entity.entityId, identifier });
      index.set(key, group);
    }
  }
  for (const [key, group] of index) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        if (
          left.entityId !== right.entityId &&
          rangesOverlap(
            left.identifier.validFrom,
            left.identifier.validTo,
            right.identifier.validFrom,
            right.identifier.validTo,
          )
        ) {
          issues.push(issue(
            "verified_identifier_collision",
            key,
            `${left.entityId} と ${right.entityId} の有効期間が重複しています`,
          ));
        }
      }
    }
  }
  return issues;
}

function validateOneHeadPerIdentity(
  entityRecords: SecurityMasterEntityRecord[],
  relationshipRecords: SecurityMasterRelationshipRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const entityCounts = new Map<string, number>();
  for (const record of activeEntityHeads(entityRecords)) {
    entityCounts.set(record.entityId, (entityCounts.get(record.entityId) ?? 0) + 1);
  }
  for (const [entityId, count] of entityCounts) {
    if (count > 1) issues.push(issue("multiple_entity_heads", entityId, `${count} active heads`));
  }
  const relationshipCounts = new Map<string, number>();
  for (const record of activeRelationshipHeads(relationshipRecords)) {
    relationshipCounts.set(
      record.relationshipId,
      (relationshipCounts.get(record.relationshipId) ?? 0) + 1,
    );
  }
  for (const [relationshipId, count] of relationshipCounts) {
    if (count > 1) {
      issues.push(issue(
        "multiple_relationship_heads",
        relationshipId,
        `${count} active heads`,
      ));
    }
  }
  return issues;
}

function validateParentCycles(
  relationships: SecurityMasterRelationshipRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const heads = activeRelationshipHeads(relationships)
    .filter((record) => record.relationshipType === "parent_of" && record.confidence === "verified");
  const children = new Map<string, string[]>();
  for (const record of heads) {
    const group = children.get(record.fromEntityId) ?? [];
    group.push(record.toEntityId);
    children.set(record.fromEntityId, group);
  }
  const visit = (node: string, stack: Set<string>, visited: Set<string>): void => {
    if (stack.has(node)) {
      issues.push(issue("parent_relationship_cycle", node, "verified parent_of graphにcycleがあります"));
      return;
    }
    if (visited.has(node)) return;
    stack.add(node);
    for (const child of children.get(node) ?? []) visit(child, stack, visited);
    stack.delete(node);
    visited.add(node);
  };
  const visited = new Set<string>();
  for (const node of children.keys()) visit(node, new Set(), visited);
  return issues;
}

export function validateSecurityMaster(
  entityRecords: SecurityMasterEntityRecord[],
  relationshipRecords: SecurityMasterRelationshipRecord[],
  schemas: SecurityMasterSchemas,
): SecurityMasterIssue[] {
  const issues = entityRecords.flatMap((record) =>
    validateSecurityEntityRecord(record, schemas.entity),
  );
  const entitiesById = new Map(
    activeEntityHeads(entityRecords).map((record) => [record.entityId, record]),
  );
  issues.push(...relationshipRecords.flatMap((record) =>
    validateSecurityRelationshipRecord(record, schemas.relationship, entitiesById),
  ));
  issues.push(
    ...duplicateIssues(entityRecords.map((record) => record.recordId), "duplicate_entity_record_id", "entity"),
    ...duplicateIssues(entityRecords.map((record) => record.contentHash), "duplicate_content_hash", "entity"),
    ...duplicateIssues(relationshipRecords.map((record) => record.recordId), "duplicate_relationship_record_id", "relationship"),
    ...duplicateIssues(relationshipRecords.map((record) => record.contentHash), "duplicate_content_hash", "relationship"),
    ...validateEntityRevisions(entityRecords),
    ...validateRelationshipRevisions(relationshipRecords),
    ...validateIdentifierCollisions(entityRecords),
    ...validateOneHeadPerIdentity(entityRecords, relationshipRecords),
    ...validateParentCycles(relationshipRecords),
  );
  return sortIssues(issues);
}

function recordsAvailableBySnapshotDate<
  T extends { recordId: string; observedAt: string; retrievedAt: string }
>(
  records: readonly T[],
  asOf: string,
): T[] {
  if (!isValidDate(asOf)) {
    throw new Error(`security_master_invalid_as_of:${asOf}`);
  }
  const cutoffEpoch = parseExplicitIso8601Instant(
    `${asOf}T23:59:59.999+09:00`,
    "security master snapshot cutoff",
  );
  return records.filter((record) => {
    const observedEpoch = parseExplicitIso8601Instant(
      record.observedAt,
      `security master revision ${record.recordId}.observedAt`,
    );
    const retrievedEpoch = parseExplicitIso8601Instant(
      record.retrievedAt,
      `security master revision ${record.recordId}.retrievedAt`,
    );
    return observedEpoch <= cutoffEpoch && retrievedEpoch <= cutoffEpoch;
  });
}

export function buildSecurityMasterSnapshot(
  entityRecords: SecurityMasterEntityRecord[],
  relationshipRecords: SecurityMasterRelationshipRecord[],
  asOf: string,
): SecurityMasterSnapshot {
  const availableEntities = recordsAvailableBySnapshotDate(entityRecords, asOf);
  const availableRelationships = recordsAvailableBySnapshotDate(relationshipRecords, asOf);
  return {
    asOf,
    entities: activeEntityHeads(availableEntities)
      .filter((record) => dateInRange(asOf, record.validFrom, record.validTo))
      .sort((a, b) => a.entityId.localeCompare(b.entityId)),
    relationships: activeRelationshipHeads(availableRelationships)
      .filter((record) => dateInRange(asOf, record.validFrom, record.validTo))
      .sort((a, b) => a.relationshipId.localeCompare(b.relationshipId)),
  };
}

export function resolveEntityByIdentifier(
  snapshot: SecurityMasterSnapshot,
  query: {
    type: SecurityIdentifier["type"];
    value: string;
    market?: string;
    provider?: string;
  },
): SecurityMasterEntityRecord {
  const market = query.market?.trim();
  const provider = query.provider?.trim();
  if (query.type === "ticker" && !market) {
    throw new Error(`security_master_market_required:ticker:${query.value}`);
  }
  if (query.type === "provider_code" && !provider) {
    throw new Error(`security_master_provider_required:provider_code:${query.value}`);
  }

  const normalizedValue = query.value.trim().toUpperCase();
  const matches = snapshot.entities.filter((entity) =>
    entity.identifiers.some((identifier) =>
      identifier.type === query.type &&
      identifier.value.trim().toUpperCase() === normalizedValue &&
      (!market || identifier.market?.trim().toUpperCase() === market.toUpperCase()) &&
      (!provider || identifier.provider?.trim().toLowerCase() === provider.toLowerCase()) &&
      identifier.confidence === "verified" &&
      dateInRange(snapshot.asOf, identifier.validFrom, identifier.validTo),
    ),
  );
  if (matches.length === 0) {
    throw new Error(`security_master_not_found:${query.type}:${query.value}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `security_master_ambiguous:${query.type}:${query.value}:${matches.map((item) => item.entityId).join(",")}`,
    );
  }
  return matches[0];
}

export function resolveListedSecurityContext(
  snapshot: SecurityMasterSnapshot,
  query: {
    type: "jpx_code" | "ticker" | "isin" | "provider_code";
    value: string;
    market?: string;
    provider?: string;
  },
): ResolvedListedSecurityContext {
  const security = resolveEntityByIdentifier(snapshot, query);
  if (security.entityType !== "listed_security") {
    throw new Error(`security_master_wrong_entity_type:${security.entityId}:${security.entityType}`);
  }
  if (security.status !== "active") {
    throw new Error(`security_master_inactive_security:${security.entityId}:${security.status}`);
  }

  const issuerRelationships = snapshot.relationships.filter((record) =>
    record.relationshipType === "issuer_of" &&
    record.toEntityId === security.entityId &&
    record.confidence === "verified",
  );
  const listingRelationships = snapshot.relationships.filter((record) =>
    record.relationshipType === "listed_on" &&
    record.fromEntityId === security.entityId &&
    record.confidence === "verified",
  );
  if (issuerRelationships.length !== 1) {
    throw new Error(
      `security_master_issuer_resolution_failed:${security.entityId}:${issuerRelationships.length}`,
    );
  }
  if (listingRelationships.length !== 1) {
    throw new Error(
      `security_master_listing_resolution_failed:${security.entityId}:${listingRelationships.length}`,
    );
  }
  const issuer = snapshot.entities.find(
    (entity) => entity.entityId === issuerRelationships[0].fromEntityId,
  );
  const listing = snapshot.entities.find(
    (entity) => entity.entityId === listingRelationships[0].toEntityId,
  );
  if (!issuer || issuer.entityType !== "legal_entity" || issuer.status !== "active") {
    throw new Error(`security_master_invalid_issuer:${issuerRelationships[0].fromEntityId}`);
  }
  if (!listing || listing.entityType !== "listing" || listing.status !== "active") {
    throw new Error(`security_master_invalid_listing:${listingRelationships[0].toEntityId}`);
  }
  return {
    security,
    issuer,
    listing,
    issuerRelationship: issuerRelationships[0],
    listingRelationship: listingRelationships[0],
  };
}

export function parseSecurityMasterJsonl<T>(
  content: string,
  sourceName: string,
): T[] {
  const records: T[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}: ${(error as Error).message}`);
    }
  }
  return records;
}

function readStrictJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseSecurityMasterJsonl<T>(content, path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Security Master lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendSecurityMasterRecords(
  paths: { entities: string; relationships: string },
  incoming: {
    entities: SecurityMasterEntityRecord[];
    relationships: SecurityMasterRelationshipRecord[];
  },
  ownerToken: string,
  schemas: SecurityMasterSchemas,
): void {
  if (incoming.entities.length === 0 && incoming.relationships.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(paths.entities), { recursive: true });
  mkdirSync(dirname(paths.relationships), { recursive: true });
  const lockPath = `${paths.entities}.security-master.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Security Master lock is already held: ${lockPath}`);
    }
    throw error;
  }

  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existingEntities = readStrictJsonl<SecurityMasterEntityRecord>(paths.entities);
    const existingRelationships = readStrictJsonl<SecurityMasterRelationshipRecord>(
      paths.relationships,
    );
    const errors = validateSecurityMaster(
      [...existingEntities, ...incoming.entities],
      [...existingRelationships, ...incoming.relationships],
      schemas,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }

    const append = (path: string, records: unknown[]): void => {
      if (records.length === 0) return;
      const fd = openSync(path, "a");
      try {
        appendFileSync(fd, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    };
    append(paths.entities, incoming.entities);
    append(paths.relationships, incoming.relationships);
  } finally {
    releaseLock(lockPath, ownerToken);
  }
}
