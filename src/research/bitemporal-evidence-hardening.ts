import { existsSync, readFileSync } from "node:fs";
import {
  appendEvidenceStoreRecords,
  parseEvidenceJsonl,
  validateBitemporalEvidenceStore,
  type EvidenceRecord,
  type EvidenceRelationRecord,
  type EvidenceSourceType,
  type EvidenceStoreIssue,
  type EvidenceStoreSchemas,
  type EvidenceTier,
} from "./bitemporal-evidence-store.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";

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

const ALLOWED_TIERS: Record<EvidenceSourceType, ReadonlySet<EvidenceTier>> = {
  statutory_filing: new Set(["primary_authoritative"]),
  exchange_disclosure: new Set(["primary_authoritative"]),
  company_ir: new Set(["primary_company"]),
  government: new Set(["primary_authoritative"]),
  regulator: new Set(["primary_authoritative"]),
  court: new Set(["primary_authoritative"]),
  official_transcript: new Set(["primary_company"]),
  reliable_news: new Set(["secondary_reliable"]),
  research_paper: new Set(["primary_authoritative", "secondary_reliable"]),
  patent: new Set(["primary_authoritative"]),
  standard: new Set(["primary_authoritative"]),
  licensed_alternative: new Set(["secondary_reliable", "discovery_only"]),
  discovery_only: new Set(["discovery_only"]),
};

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

function validateTierMapping(records: EvidenceRecord[]): EvidenceStoreIssue[] {
  return records.flatMap((record) =>
    ALLOWED_TIERS[record.sourceType].has(record.evidenceTier)
      ? []
      : [issue(
        "source_tier_mismatch",
        record.evidenceId,
        `${record.sourceType}を${record.evidenceTier}として扱えません`,
      )],
  );
}

function transitionAllowed(
  previous: EvidenceRecord["status"],
  current: EvidenceRecord["status"],
): boolean {
  const allowed: Record<
    EvidenceRecord["status"],
    ReadonlySet<EvidenceRecord["status"]>
  > = {
    active: new Set(["active", "corrected", "retracted", "withdrawn", "expired"]),
    corrected: new Set(["corrected", "retracted", "withdrawn", "expired"]),
    retracted: new Set(["retracted"]),
    withdrawn: new Set(["withdrawn"]),
    expired: new Set(["expired"]),
  };
  return allowed[previous].has(current);
}

function validateEvidenceLifecycle(records: EvidenceRecord[]): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record]));
  for (const record of records) {
    if (!record.supersedesRecordId) continue;
    const previous = byId.get(record.supersedesRecordId);
    if (!previous) continue;
    if (!transitionAllowed(previous.status, record.status)) {
      issues.push(issue(
        "invalid_evidence_status_transition",
        record.recordId,
        `${previous.status} -> ${record.status} は許可されません`,
      ));
    }
    if (record.publishedAt !== previous.publishedAt) {
      issues.push(issue(
        "evidence_revision_published_at_changed",
        record.recordId,
        "同一Evidence revisionでpublishedAtを変更できません。別Evidenceとして訂正relationを保存してください",
      ));
    }
    if (record.eventAtStatus !== previous.eventAtStatus || record.eventAt !== previous.eventAt) {
      issues.push(issue(
        "evidence_revision_event_time_changed",
        record.recordId,
        "同一Evidence revisionでevent timeを変更できません。別Evidenceとcorrection relationを使用してください",
      ));
    }
    if (
      compareExplicitIso8601Instants(
        record.firstExecutableAt,
        previous.firstExecutableAt,
        `Evidence ${record.recordId}.firstExecutableAt`,
        `Evidence ${previous.recordId}.firstExecutableAt`,
      ) < 0
    ) {
      issues.push(issue(
        "evidence_revision_executable_time_regressed",
        record.recordId,
        "同一Evidence revisionでfirstExecutableAtを前倒しできません",
      ));
    }
  }
  return issues;
}

function earliestEvidenceById(records: EvidenceRecord[]): Map<string, EvidenceRecord> {
  const selected = new Map<string, EvidenceRecord>();
  for (const record of records) {
    const prior = selected.get(record.evidenceId);
    if (!prior) {
      selected.set(record.evidenceId, record);
      continue;
    }
    const observedOrder = compareExplicitIso8601Instants(
      record.observedAt,
      prior.observedAt,
      `Evidence ${record.recordId}.observedAt`,
      `Evidence ${prior.recordId}.observedAt`,
    );
    if (
      observedOrder < 0
      || (
        observedOrder === 0
        && compareExplicitIso8601Instants(
          record.retrievedAt,
          prior.retrievedAt,
          `Evidence ${record.recordId}.retrievedAt`,
          `Evidence ${prior.recordId}.retrievedAt`,
        ) < 0
      )
    ) {
      selected.set(record.evidenceId, record);
    }
  }
  return selected;
}

function validateRelationKnowledgeChronology(
  evidence: EvidenceRecord[],
  relations: EvidenceRelationRecord[],
): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  const evidenceById = earliestEvidenceById(evidence);
  for (const relation of relations) {
    const from = evidenceById.get(relation.fromEvidenceId);
    const to = evidenceById.get(relation.toEvidenceId);
    if (
      from
      && compareExplicitIso8601Instants(
        relation.retrievedAt,
        from.retrievedAt,
        `Evidence relation ${relation.recordId}.retrievedAt`,
        `Evidence ${from.recordId}.retrievedAt`,
      ) < 0
    ) {
      issues.push(issue(
        "relation_retrieved_before_source_evidence",
        relation.recordId,
        "relation retrievedAtをfrom Evidence取得前にできません",
      ));
    }
    if (
      to
      && compareExplicitIso8601Instants(
        relation.retrievedAt,
        to.retrievedAt,
        `Evidence relation ${relation.recordId}.retrievedAt`,
        `Evidence ${to.recordId}.retrievedAt`,
      ) < 0
    ) {
      issues.push(issue(
        "relation_retrieved_before_target_evidence",
        relation.recordId,
        "relation retrievedAtをto Evidence取得前にできません",
      ));
    }
  }
  return issues;
}

function validateBindingRelationAuthority(
  evidence: EvidenceRecord[],
  relations: EvidenceRelationRecord[],
): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  const evidenceById = new Map(
    activeEvidenceHeads(evidence).map((record) => [record.evidenceId, record]),
  );
  for (const relation of activeRelationHeads(relations)) {
    if (relation.supersessionStrength !== "binding") continue;
    const from = evidenceById.get(relation.fromEvidenceId);
    if (!from) continue;
    if (!["primary_authoritative", "primary_company"].includes(from.evidenceTier)) {
      issues.push(issue(
        "binding_relation_without_primary_source",
        relation.relationId,
        `binding relationのsource Evidence Tier=${from.evidenceTier}は不足です`,
      ));
    }
    if (from.status !== "active") {
      issues.push(issue(
        "binding_relation_from_inactive_evidence",
        relation.relationId,
        `binding relation source status=${from.status}は使用できません`,
      ));
    }
  }
  return issues;
}

function validateRelationCycles(relations: EvidenceRelationRecord[]): EvidenceStoreIssue[] {
  const issues: EvidenceStoreIssue[] = [];
  const binding = activeRelationHeads(relations)
    .filter((record) =>
      record.supersessionStrength === "binding" &&
      ["corrects", "retracts", "supersedes", "invalidates", "expires"].includes(
        record.relationType,
      ),
    );
  const edges = new Map<string, string[]>();
  for (const relation of binding) {
    const group = edges.get(relation.fromEvidenceId) ?? [];
    group.push(relation.toEvidenceId);
    edges.set(relation.fromEvidenceId, group);
  }
  const visited = new Set<string>();
  const walk = (node: string, stack: Set<string>): void => {
    if (stack.has(node)) {
      issues.push(issue(
        "binding_evidence_relation_cycle",
        node,
        "binding correction/supersession graphにcycleがあります",
      ));
      return;
    }
    if (visited.has(node)) return;
    stack.add(node);
    for (const target of edges.get(node) ?? []) walk(target, stack);
    stack.delete(node);
    visited.add(node);
  };
  for (const node of edges.keys()) walk(node, new Set());
  return issues;
}

export function validateBitemporalEvidenceStoreGoverned(
  evidence: EvidenceRecord[],
  relations: EvidenceRelationRecord[],
  schemas: EvidenceStoreSchemas,
  knownEntityIds?: ReadonlySet<string>,
): EvidenceStoreIssue[] {
  return sortIssues([
    ...validateBitemporalEvidenceStore(evidence, relations, schemas, knownEntityIds),
    ...validateTierMapping(evidence),
    ...validateEvidenceLifecycle(evidence),
    ...validateRelationKnowledgeChronology(evidence, relations),
    ...validateBindingRelationAuthority(evidence, relations),
    ...validateRelationCycles(relations),
  ]);
}

function readExistingJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return parseEvidenceJsonl<T>(readFileSync(path, "utf-8"), path);
}

export function appendEvidenceStoreRecordsGoverned(
  paths: { evidence: string; relations: string },
  incoming: { evidence: EvidenceRecord[]; relations: EvidenceRelationRecord[] },
  ownerToken: string,
  schemas: EvidenceStoreSchemas,
  knownEntityIds?: ReadonlySet<string>,
): void {
  const existingEvidence = readExistingJsonl<EvidenceRecord>(paths.evidence);
  const existingRelations = readExistingJsonl<EvidenceRelationRecord>(paths.relations);
  const errors = validateBitemporalEvidenceStoreGoverned(
    [...existingEvidence, ...incoming.evidence],
    [...existingRelations, ...incoming.relations],
    schemas,
    knownEntityIds,
  ).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }
  appendEvidenceStoreRecords(paths, incoming, ownerToken, schemas, knownEntityIds);
}
