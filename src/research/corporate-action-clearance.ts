import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { parseExplicitIso8601Instant } from "./iso-instant.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type CorporateActionEvidenceTier = "A" | "B";

export type CorporateActionClearanceRecord = {
  schemaVersion: 1;
  clearanceId: string;
  assessedAt: string;
  assessmentMethod: "official-corporate-action-clearance-v1";
  code: string;
  market: string;
  source: string;
  providerPlan: "free" | "standard" | "premium" | "official_public" | "synthetic" | "unknown";
  fromTradingDate: string;
  throughTradingDate: string;
  status: "clear" | "action_detected" | "inconclusive";
  sourceEvidence: Array<{ tier: CorporateActionEvidenceTier; ref: string }>;
  notes?: string[];
  supersedesClearanceId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type CorporateActionEvidenceContext = {
  tier: CorporateActionEvidenceTier;
  observedAt: string;
};

export type CorporateActionClearanceContext = {
  evidenceByRef: ReadonlyMap<string, CorporateActionEvidenceContext>;
};

export type CorporateActionClearanceIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const CORPORATE_ACTION_CLEARANCE_PATHS = {
  records: "research/corporate-actions/clearances.jsonl",
  schema: "research/schemas/corporate-action-clearance.schema.json",
} as const;

function issue(code: string, target: string, message: string): CorporateActionClearanceIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: CorporateActionClearanceRecord,
): Omit<CorporateActionClearanceRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function assertCanonicalAssessedAt(record: Pick<CorporateActionClearanceRecord, "assessedAt">): void {
  parseExplicitIso8601Instant(record.assessedAt, "assessedAt");
}

export function computeCorporateActionClearanceHash(
  record: CorporateActionClearanceRecord | Omit<CorporateActionClearanceRecord, "contentHash">,
): string {
  assertCanonicalAssessedAt(record);
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withCorporateActionClearanceHash(
  record: Omit<CorporateActionClearanceRecord, "contentHash">,
): CorporateActionClearanceRecord {
  return { ...record, contentHash: computeCorporateActionClearanceHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

export function validateCorporateActionClearanceRecord(
  value: unknown,
  schema: JsonSchema,
  context: CorporateActionClearanceContext,
): CorporateActionClearanceIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "CorporateActionClearanceRecord",
      error.message,
    ));
  }

  const record = value as CorporateActionClearanceRecord;
  const target = `corporate-action-clearance:${record.clearanceId}`;
  const issues: CorporateActionClearanceIssue[] = [];

  let assessedAtMs: number;
  try {
    assessedAtMs = parseExplicitIso8601Instant(record.assessedAt, "assessedAt");
  } catch {
    issues.push(issue("invalid_assessed_at", target, "assessedAtが不正です"));
    return issues.sort((left, right) =>
      `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
    );
  }

  if (record.contentHash !== computeCorporateActionClearanceHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (record.fromTradingDate > record.throughTradingDate) {
    issues.push(issue("clearance_window_reversed", target, "fromTradingDate <= throughTradingDate が必要です"));
  }

  for (const evidence of record.sourceEvidence) {
    if (secretLikeReference(evidence.ref)) {
      issues.push(issue("secret_like_evidence_ref", target, "secret/tokenを含む可能性があるevidence refを保存できません"));
      continue;
    }
    const canonical = context.evidenceByRef.get(evidence.ref);
    if (!canonical) {
      issues.push(issue("unknown_evidence_ref", target, `未検証evidence refです: ${evidence.ref}`));
      continue;
    }
    if (canonical.tier !== evidence.tier) {
      issues.push(issue("evidence_tier_mismatch", target, `evidence tierが正本と一致しません: ${evidence.ref}`));
    }
    let observedAtMs: number;
    try {
      observedAtMs = parseExplicitIso8601Instant(canonical.observedAt, `Evidence ${evidence.ref}.observedAt`);
    } catch {
      issues.push(issue(
        "invalid_evidence_observed_at",
        target,
        `Evidence observedAtが不正です: ${evidence.ref}`,
      ));
      continue;
    }
    if (observedAtMs > assessedAtMs) {
      issues.push(issue("future_evidence", target, `assessedAt後のEvidenceを事前clearanceへ使えません: ${evidence.ref}`));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateCorporateActionClearanceRecords(
  records: CorporateActionClearanceRecord[],
  schema: JsonSchema,
  context: CorporateActionClearanceContext,
): CorporateActionClearanceIssue[] {
  const issues = records.flatMap((record) => validateCorporateActionClearanceRecord(record, schema, context));
  const byId = new Map<string, CorporateActionClearanceRecord>();
  const childrenByParent = new Map<string, string[]>();

  for (const record of records) {
    if (byId.has(record.clearanceId)) {
      issues.push(issue("duplicate_clearance_id", record.clearanceId, "clearanceIdが重複しています"));
    } else {
      byId.set(record.clearanceId, record);
    }
    if (record.supersedesClearanceId) {
      const children = childrenByParent.get(record.supersedesClearanceId) ?? [];
      children.push(record.clearanceId);
      childrenByParent.set(record.supersedesClearanceId, children);
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "clearance_revision_fork",
        parentId,
        `clearance revisionを分岐できません: ${children.sort().join(",")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesClearanceId) continue;
    const prior = byId.get(record.supersedesClearanceId);
    if (!prior) {
      issues.push(issue("missing_superseded_clearance", record.clearanceId, "supersedesClearanceIdが見つかりません"));
      continue;
    }
    if (
      prior.code !== record.code
      || prior.market !== record.market
      || prior.source !== record.source
      || prior.providerPlan !== record.providerPlan
    ) {
      issues.push(issue("clearance_revision_identity_mismatch", record.clearanceId, "revisionでseries identityを変更できません"));
    }
    if (Date.parse(record.assessedAt) <= Date.parse(prior.assessedAt)) {
      issues.push(issue("clearance_assessed_at_not_monotonic", record.clearanceId, "revision assessedAtは直前recordより後である必要があります"));
    }
    if (record.fromTradingDate > prior.fromTradingDate) {
      issues.push(issue("clearance_window_start_regressed", record.clearanceId, "revisionでclearance開始日を後ろへ狭められません"));
    }
    if (record.throughTradingDate < prior.throughTradingDate) {
      issues.push(issue("clearance_window_end_regressed", record.clearanceId, "revisionでclearance終了日を過去へ戻せません"));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseCorporateActionClearanceJsonl(
  content: string,
  path = "<memory>",
): CorporateActionClearanceRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as CorporateActionClearanceRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readCorporateActionClearanceJsonl(path: string): CorporateActionClearanceRecord[] {
  if (!existsSync(path)) return [];
  return parseCorporateActionClearanceJsonl(readFileSync(path, "utf-8"), path);
}

export function appendCorporateActionClearanceRecords(input: {
  path: string;
  incoming: CorporateActionClearanceRecord[];
  schema: JsonSchema;
  context: CorporateActionClearanceContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readCorporateActionClearanceJsonl(input.path);
  const errors = validateCorporateActionClearanceRecords(
    [...existing, ...input.incoming],
    input.schema,
    input.context,
  ).filter((candidate) => candidate.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((candidate) => `${candidate.code} ${candidate.target}: ${candidate.message}`).join("\n"));
  }

  mkdirSync(dirname(input.path), { recursive: true });
  const fd = openSync(input.path, "a");
  try {
    appendFileSync(fd, `${input.incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
