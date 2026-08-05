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
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type EvidenceSourceType =
  | "statutory_filing"
  | "exchange_disclosure"
  | "company_ir"
  | "government"
  | "regulator"
  | "court"
  | "official_transcript"
  | "reliable_news"
  | "research_paper"
  | "patent"
  | "standard"
  | "licensed_alternative"
  | "discovery_only";

export type EvidenceTier =
  | "primary_authoritative"
  | "primary_company"
  | "secondary_reliable"
  | "discovery_only";

export type EvidenceStatus = "active" | "corrected" | "retracted" | "withdrawn" | "expired";
export type EvidenceLicense = "redistributable" | "metadata_only" | "local_only" | "unknown";
export type EvidenceStoragePolicy =
  | "metadata_only"
  | "hash_only"
  | "local_only_content"
  | "redistributable_content";

export type EvidenceRecord = {
  schemaVersion: 1;
  recordId: string;
  evidenceId: string;
  entityIds: string[];
  sourceId: string;
  sourceType: EvidenceSourceType;
  sourceLocator: string;
  documentId?: string;
  sourceContentHash: string;
  eventAtStatus: "known" | "unknown" | "not_applicable";
  eventAt?: string;
  publishedAt: string;
  observedAt: string;
  retrievedAt: string;
  effectiveFrom: string;
  effectiveTo?: string;
  firstExecutableAt: string;
  evidenceTier: EvidenceTier;
  status: EvidenceStatus;
  license: EvidenceLicense;
  storagePolicy: EvidenceStoragePolicy;
  title: string;
  summary: string;
  retrievalRunId: string;
  parserVersion: string;
  supersedesRecordId?: string;
  contentHash: string;
};

export type EvidenceRecordInput = Omit<EvidenceRecord, "contentHash">;

export type EvidenceRelationType =
  | "supports"
  | "contradicts"
  | "corrects"
  | "retracts"
  | "supersedes"
  | "confirms"
  | "invalidates"
  | "expires";

export type EvidenceRelationRecord = {
  schemaVersion: 1;
  recordId: string;
  relationId: string;
  relationType: EvidenceRelationType;
  fromEvidenceId: string;
  toEvidenceId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  observedAt: string;
  retrievedAt: string;
  sourceRefs: string[];
  supersessionStrength: "informational" | "partial" | "binding";
  supersedesRecordId?: string;
  contentHash: string;
};

export type EvidenceRelationRecordInput = Omit<EvidenceRelationRecord, "contentHash">;

export type EvidenceStoreIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type EvidenceStoreSchemas = {
  evidence: JsonSchema;
  relation: JsonSchema;
};

export type EvidenceReplayMode = "provider_available" | "system_replay";
export type EvidenceAvailabilityBoundary = "knowledge" | "executable";

export type EvidenceSnapshot = {
  asOf: string;
  mode: EvidenceReplayMode;
  boundary: EvidenceAvailabilityBoundary;
  evidence: EvidenceRecord[];
  relations: EvidenceRelationRecord[];
};

export const EVIDENCE_STORE_PATHS = {
  evidence: "research/evidence_store/evidence.jsonl",
  relations: "research/evidence_store/relations.jsonl",
  evidenceSchema: "research/schemas/evidence-record.schema.json",
  relationSchema: "research/schemas/evidence-relation-record.schema.json",
} as const;

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutEvidenceHash(record: EvidenceRecord): EvidenceRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutRelationHash(record: EvidenceRelationRecord): EvidenceRelationRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeEvidenceRecordHash(
  record: EvidenceRecord | EvidenceRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutEvidenceHash(record) : record);
}

export function withEvidenceRecordHash(record: EvidenceRecordInput): EvidenceRecord {
  return { ...record, contentHash: computeEvidenceRecordHash(record) };
}

export function computeEvidenceRelationHash(
  record: EvidenceRelationRecord | EvidenceRelationRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutRelationHash(record) : record);
}

export function withEvidenceRelationHash(
  record: EvidenceRelationRecordInput,
): EvidenceRelationRecord {
  return { ...record, contentHash: computeEvidenceRelationHash(record) };
}

function issue(
  code: string,
  target: string,
  message: string,
  severity: EvidenceStoreIssue["severity"] = "error",
): EvidenceStoreIssue {
  return { severity, code, target, message };
}

function sortIssues(issues: EvidenceStoreIssue[]): EvidenceStoreIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function schemaIssues(value: unknown, schema: JsonSchema, target: string): EvidenceStoreIssue[] {
  return validate(value, schema).map((error) => issue(
    "schema_violation",
    error.path ? `${target}:${error.path}` : target,
    error.message,
  ));
}

function timeMs(value: string): number {
  return Date.parse(value);
}

function validateTimeOrder(record: EvidenceRecord, target: string): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  if (timeMs(record.observedAt) < timeMs(record.publishedAt)) {
    issues.push(issue(
      "observed_before_published",
      target,
      `${record.observedAt} < ${record.publishedAt}`,
    ));
  }
  if (timeMs(record.retrievedAt) < timeMs(record.observedAt)) {
    issues.push(issue(
      "retrieved_before_observed",
      target,
      `${record.retrievedAt} < ${record.observedAt}`,
    ));
  }
  if (timeMs(record.firstExecutableAt) < Math.max(
    timeMs(record.observedAt),
    timeMs(record.retrievedAt),
  )) {
    issues.push(issue(
      "executable_before_knowledge",
      target,
      "firstExecutableAtはobservedAt/retrievedAt以後が必要です",
    ));
  }
  if (record.effectiveTo && timeMs(record.effectiveTo) < timeMs(record.effectiveFrom)) {
    issues.push(issue(
      "invalid_effective_period",
      target,
      `${record.effectiveTo} < ${record.effectiveFrom}`,
    ));
  }
  return issues;
}

function validateLicensePolicy(record: EvidenceRecord, target: string): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  if (record.license === "unknown") {
    issues.push(issue(
      "unknown_license",
      target,
      "license=unknownのEvidenceはgoverned storeへ取り込めません",
    ));
  }
  if (
    record.license === "metadata_only" &&
    !["metadata_only", "hash_only"].includes(record.storagePolicy)
  ) {
    issues.push(issue(
      "metadata_license_content_storage",
      target,
      `${record.storagePolicy}はmetadata_only licenseで許可されません`,
    ));
  }
  if (
    record.license === "local_only" &&
    record.storagePolicy === "redistributable_content"
  ) {
    issues.push(issue(
      "local_only_redistribution",
      target,
      "local_only evidenceをredistributable_contentとして扱えません",
    ));
  }
  if (
    record.storagePolicy === "redistributable_content" &&
    record.license !== "redistributable"
  ) {
    issues.push(issue(
      "redistribution_without_license",
      target,
      "redistributable_contentにはredistributable licenseが必要です",
    ));
  }
  return issues;
}

export function validateEvidenceRecord(
  record: EvidenceRecord,
  schema: JsonSchema,
  knownEntityIds?: ReadonlySet<string>,
  target = `evidence:${record.evidenceId}:${record.recordId}`,
): EvidenceStoreIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeEvidenceRecordHash(record)) {
    issues.push(issue("invalid_content_hash", target, "Evidence contentHashが一致しません"));
  }
  issues.push(...validateTimeOrder(record, target));
  issues.push(...validateLicensePolicy(record, target));

  if (record.eventAtStatus === "known" && !record.eventAt) {
    issues.push(issue("known_event_without_event_at", target, "eventAtStatus=knownにはeventAtが必要です"));
  }
  if (record.eventAtStatus !== "known" && record.eventAt) {
    issues.push(issue(
      "unexpected_event_at",
      target,
      `${record.eventAtStatus}ではeventAtを設定できません`,
    ));
  }
  if (record.sourceType === "discovery_only" && record.evidenceTier !== "discovery_only") {
    issues.push(issue(
      "discovery_source_promoted",
      target,
      "discovery_only sourceを上位Evidence Tierへ昇格できません",
    ));
  }
  if (record.evidenceTier === "discovery_only") {
    issues.push(issue(
      "discovery_only_evidence",
      target,
      "Discovery-only EvidenceはRecommendationへ使用できません",
      "warning",
    ));
  }
  if (record.status !== "active") {
    issues.push(issue(
      "non_active_evidence",
      target,
      `status=${record.status}は最新事実として直接使用できません`,
      "warning",
    ));
  }
  if (knownEntityIds) {
    for (const entityId of record.entityIds) {
      if (!knownEntityIds.has(entityId)) {
        issues.push(issue(
          "unknown_security_master_entity",
          target,
          `Security Masterに存在しないentityIdです: ${entityId}`,
        ));
      }
    }
  }
  return sortIssues(issues);
}

const BINDING_RELATION_TYPES = new Set<EvidenceRelationType>([
  "corrects",
  "retracts",
  "supersedes",
  "invalidates",
  "expires",
]);

export function validateEvidenceRelationRecord(
  record: EvidenceRelationRecord,
  schema: JsonSchema,
  evidenceById: ReadonlyMap<string, EvidenceRecord>,
  target = `evidence-relation:${record.relationId}:${record.recordId}`,
): EvidenceStoreIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeEvidenceRelationHash(record)) {
    issues.push(issue("invalid_content_hash", target, "Evidence relation contentHashが一致しません"));
  }
  if (record.fromEvidenceId === record.toEvidenceId) {
    issues.push(issue("self_evidence_relation", target, "自己relationは許可されません"));
  }
  if (timeMs(record.retrievedAt) < timeMs(record.observedAt)) {
    issues.push(issue(
      "relation_retrieved_before_observed",
      target,
      `${record.retrievedAt} < ${record.observedAt}`,
    ));
  }
  if (record.effectiveTo && timeMs(record.effectiveTo) < timeMs(record.effectiveFrom)) {
    issues.push(issue("invalid_relation_effective_period", target, "effectiveToがeffectiveFromより前です"));
  }

  const from = evidenceById.get(record.fromEvidenceId);
  const to = evidenceById.get(record.toEvidenceId);
  if (!from) issues.push(issue("missing_from_evidence", target, record.fromEvidenceId));
  if (!to) issues.push(issue("missing_to_evidence", target, record.toEvidenceId));
  if (from && to && BINDING_RELATION_TYPES.has(record.relationType)) {
    if (timeMs(from.observedAt) < timeMs(to.observedAt)) {
      issues.push(issue(
        "binding_relation_from_older_evidence",
        target,
        "訂正・撤回・supersession側Evidenceは対象Evidence以後に観測される必要があります",
      ));
    }
    if (timeMs(record.observedAt) < timeMs(from.observedAt)) {
      issues.push(issue(
        "relation_observed_before_source_evidence",
        target,
        "relation observedAtをfrom Evidence観測前にできません",
      ));
    }
  }
  if (
    record.supersessionStrength === "binding" &&
    !BINDING_RELATION_TYPES.has(record.relationType)
  ) {
    issues.push(issue(
      "binding_strength_on_non_binding_relation",
      target,
      `${record.relationType}をbinding supersessionとして扱えません`,
    ));
  }
  return sortIssues(issues);
}

function duplicateIssues(values: string[], code: string, target: string): EvidenceStoreIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

function activeEvidenceHeads(records: EvidenceRecord[]): EvidenceRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function activeRelationHeads(records: EvidenceRelationRecord[]): EvidenceRelationRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function validateRevisionChains<T extends {
  recordId: string;
  supersedesRecordId?: string;
  observedAt: string;
  retrievedAt: string;
}>(
  records: T[],
  identity: (record: T) => string,
  prefix: string,
): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record]));
  for (const record of records) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue(`${prefix}_self_supersession`, record.recordId, "record自身をsupersedeできません"));
    }
    if (!record.supersedesRecordId) continue;
    const previous = byId.get(record.supersedesRecordId);
    if (!previous) {
      issues.push(issue(`${prefix}_missing_revision_parent`, record.recordId, record.supersedesRecordId));
      continue;
    }
    if (identity(record) !== identity(previous)) {
      issues.push(issue(
        `${prefix}_revision_identity_mismatch`,
        record.recordId,
        "logical identityをrevisionで変更できません",
      ));
    }
    if (
      timeMs(record.observedAt) <= timeMs(previous.observedAt) ||
      timeMs(record.retrievedAt) <= timeMs(previous.retrievedAt)
    ) {
      issues.push(issue(
        `${prefix}_revision_time_not_monotonic`,
        record.recordId,
        "observedAt/retrievedAtは直前revisionより後である必要があります",
      ));
    }
  }
  for (const record of records) {
    const seen = new Set<string>();
    let current: T | undefined = record;
    while (current?.supersedesRecordId) {
      if (seen.has(current.recordId)) {
        issues.push(issue(`${prefix}_revision_cycle`, record.recordId, "revision chainにcycleがあります"));
        break;
      }
      seen.add(current.recordId);
      current = byId.get(current.supersedesRecordId);
    }
  }
  return issues;
}

function validateOneHeadPerIdentity(
  evidence: EvidenceRecord[],
  relations: EvidenceRelationRecord[],
): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  const evidenceCounts = new Map<string, number>();
  for (const record of activeEvidenceHeads(evidence)) {
    evidenceCounts.set(record.evidenceId, (evidenceCounts.get(record.evidenceId) ?? 0) + 1);
  }
  for (const [evidenceId, count] of evidenceCounts) {
    if (count > 1) issues.push(issue("multiple_evidence_heads", evidenceId, `${count} active heads`));
  }
  const relationCounts = new Map<string, number>();
  for (const record of activeRelationHeads(relations)) {
    relationCounts.set(record.relationId, (relationCounts.get(record.relationId) ?? 0) + 1);
  }
  for (const [relationId, count] of relationCounts) {
    if (count > 1) issues.push(issue("multiple_relation_heads", relationId, `${count} active heads`));
  }
  return issues;
}

export function validateBitemporalEvidenceStore(
  evidence: EvidenceRecord[],
  relations: EvidenceRelationRecord[],
  schemas: EvidenceStoreSchemas,
  knownEntityIds?: ReadonlySet<string>,
): EvidenceStoreIssue[] {
  const issues = evidence.flatMap((record) =>
    validateEvidenceRecord(record, schemas.evidence, knownEntityIds),
  );
  const evidenceById = new Map(
    activeEvidenceHeads(evidence).map((record) => [record.evidenceId, record]),
  );
  issues.push(...relations.flatMap((record) =>
    validateEvidenceRelationRecord(record, schemas.relation, evidenceById),
  ));
  issues.push(
    ...duplicateIssues(evidence.map((record) => record.recordId), "duplicate_evidence_record_id", "evidence"),
    ...duplicateIssues(evidence.map((record) => record.contentHash), "duplicate_content_hash", "evidence"),
    ...duplicateIssues(relations.map((record) => record.recordId), "duplicate_relation_record_id", "relation"),
    ...duplicateIssues(relations.map((record) => record.contentHash), "duplicate_content_hash", "relation"),
    ...validateRevisionChains(
      evidence,
      (record) => `${record.evidenceId}:${record.sourceId}:${record.documentId ?? "*"}`,
      "evidence",
    ),
    ...validateRevisionChains(
      relations,
      (record) => `${record.relationId}:${record.relationType}:${record.fromEvidenceId}:${record.toEvidenceId}`,
      "relation",
    ),
    ...validateOneHeadPerIdentity(evidence, relations),
  );
  return sortIssues(issues);
}

function recordAvailable(
  record: EvidenceRecord,
  asOfMs: number,
  mode: EvidenceReplayMode,
  boundary: EvidenceAvailabilityBoundary,
): boolean {
  if (timeMs(record.observedAt) > asOfMs) return false;
  if (mode === "system_replay" && timeMs(record.retrievedAt) > asOfMs) return false;
  if (boundary === "executable" && timeMs(record.firstExecutableAt) > asOfMs) return false;
  if (timeMs(record.effectiveFrom) > asOfMs) return false;
  if (record.effectiveTo && timeMs(record.effectiveTo) < asOfMs) return false;
  return true;
}

function relationAvailable(
  record: EvidenceRelationRecord,
  asOfMs: number,
  mode: EvidenceReplayMode,
): boolean {
  if (timeMs(record.observedAt) > asOfMs) return false;
  if (mode === "system_replay" && timeMs(record.retrievedAt) > asOfMs) return false;
  if (timeMs(record.effectiveFrom) > asOfMs) return false;
  if (record.effectiveTo && timeMs(record.effectiveTo) < asOfMs) return false;
  return true;
}

function latestEvidenceAsOf(
  records: EvidenceRecord[],
  asOfMs: number,
  mode: EvidenceReplayMode,
  boundary: EvidenceAvailabilityBoundary,
): EvidenceRecord[] {
  const selected = new Map<string, EvidenceRecord>();
  for (const record of records) {
    if (!recordAvailable(record, asOfMs, mode, boundary)) continue;
    const prior = selected.get(record.evidenceId);
    if (
      !prior ||
      timeMs(record.observedAt) > timeMs(prior.observedAt) ||
      (
        timeMs(record.observedAt) === timeMs(prior.observedAt) &&
        timeMs(record.retrievedAt) > timeMs(prior.retrievedAt)
      )
    ) {
      selected.set(record.evidenceId, record);
    }
  }
  return [...selected.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
}

function latestRelationsAsOf(
  records: EvidenceRelationRecord[],
  asOfMs: number,
  mode: EvidenceReplayMode,
): EvidenceRelationRecord[] {
  const selected = new Map<string, EvidenceRelationRecord>();
  for (const record of records) {
    if (!relationAvailable(record, asOfMs, mode)) continue;
    const prior = selected.get(record.relationId);
    if (
      !prior ||
      timeMs(record.observedAt) > timeMs(prior.observedAt) ||
      (
        timeMs(record.observedAt) === timeMs(prior.observedAt) &&
        timeMs(record.retrievedAt) > timeMs(prior.retrievedAt)
      )
    ) {
      selected.set(record.relationId, record);
    }
  }
  return [...selected.values()].sort((a, b) => a.relationId.localeCompare(b.relationId));
}

export function buildEvidenceSnapshot(
  evidence: EvidenceRecord[],
  relations: EvidenceRelationRecord[],
  asOf: string,
  mode: EvidenceReplayMode = "system_replay",
  boundary: EvidenceAvailabilityBoundary = "knowledge",
): EvidenceSnapshot {
  const asOfMs = timeMs(asOf);
  if (!Number.isFinite(asOfMs)) throw new Error(`invalid asOf: ${asOf}`);
  const selectedEvidence = latestEvidenceAsOf(evidence, asOfMs, mode, boundary);
  const evidenceIds = new Set(selectedEvidence.map((record) => record.evidenceId));
  return {
    asOf,
    mode,
    boundary,
    evidence: selectedEvidence,
    relations: latestRelationsAsOf(relations, asOfMs, mode)
      .filter((record) =>
        evidenceIds.has(record.fromEvidenceId) && evidenceIds.has(record.toEvidenceId),
      ),
  };
}

export function bindingDispositionByEvidenceId(
  snapshot: EvidenceSnapshot,
): Map<string, EvidenceStatus> {
  const disposition = new Map(
    snapshot.evidence.map((record) => [record.evidenceId, record.status]),
  );
  const binding = snapshot.relations.filter((record) => record.supersessionStrength === "binding");
  for (const relation of binding) {
    if (relation.relationType === "corrects" || relation.relationType === "supersedes") {
      disposition.set(relation.toEvidenceId, "corrected");
    } else if (relation.relationType === "retracts" || relation.relationType === "invalidates") {
      disposition.set(relation.toEvidenceId, "retracted");
    } else if (relation.relationType === "expires") {
      disposition.set(relation.toEvidenceId, "expired");
    }
  }
  return disposition;
}

export function recommendationEligibleEvidence(snapshot: EvidenceSnapshot): EvidenceRecord[] {
  if (snapshot.mode !== "system_replay") {
    throw new Error("Recommendation evidence requires system_replay mode");
  }
  const disposition = bindingDispositionByEvidenceId(snapshot);
  return snapshot.evidence.filter((record) =>
    disposition.get(record.evidenceId) === "active" &&
    record.evidenceTier !== "discovery_only" &&
    record.license !== "unknown",
  );
}

export function parseEvidenceJsonl<T>(content: string, sourceName: string): T[] {
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
  return parseEvidenceJsonl<T>(content, path);
}

function writeJournal(path: string, journal: unknown): void {
  writeFileSync(path, `${JSON.stringify(journal)}\n`, "utf-8");
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Evidence Store lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendEvidenceStoreRecords(
  paths: { evidence: string; relations: string },
  incoming: { evidence: EvidenceRecord[]; relations: EvidenceRelationRecord[] },
  ownerToken: string,
  schemas: EvidenceStoreSchemas,
  knownEntityIds?: ReadonlySet<string>,
): void {
  if (incoming.evidence.length === 0 && incoming.relations.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(paths.evidence), { recursive: true });
  mkdirSync(dirname(paths.relations), { recursive: true });
  const lockPath = `${paths.evidence}.evidence-store.lock`;
  const journalPath = `${paths.evidence}.batch-journal.json`;
  if (existsSync(journalPath)) throw new Error(`incomplete_evidence_batch:${journalPath}`);
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Evidence Store lock is already held: ${lockPath}`);
    }
    throw error;
  }

  let committed = false;
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existingEvidence = readStrictJsonl<EvidenceRecord>(paths.evidence);
    const existingRelations = readStrictJsonl<EvidenceRelationRecord>(paths.relations);
    const errors = validateBitemporalEvidenceStore(
      [...existingEvidence, ...incoming.evidence],
      [...existingRelations, ...incoming.relations],
      schemas,
      knownEntityIds,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }

    const journal = {
      schemaVersion: 1,
      ownerToken,
      preparedAt: new Date().toISOString(),
      state: "prepared",
      evidenceHashes: incoming.evidence.map((record) => record.contentHash).sort(),
      relationHashes: incoming.relations.map((record) => record.contentHash).sort(),
    };
    writeJournal(journalPath, journal);

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
    append(paths.evidence, incoming.evidence);
    writeJournal(journalPath, { ...journal, state: "evidence_appended" });
    append(paths.relations, incoming.relations);
    writeJournal(journalPath, { ...journal, state: "committed" });
    committed = true;
  } finally {
    if (committed && existsSync(journalPath)) rmSync(journalPath);
    releaseLock(lockPath, ownerToken);
  }
}
