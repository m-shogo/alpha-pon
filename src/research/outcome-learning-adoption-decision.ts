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
import {
  computeOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "./outcome-learning-proposal.js";
import {
  computeOutcomeLearningShadowEvaluationHash,
  type OutcomeLearningShadowEvaluationRecord,
} from "./outcome-learning-shadow-evaluation.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type OutcomeLearningAdoptionDecisionKind =
  | "defer"
  | "approve_change_preparation"
  | "reject";

export type OutcomeLearningAdoptionDecisionRecord = {
  schemaVersion: 1;
  adoptionDecisionId: string;
  decidedAt: string;
  shadowEvaluationId: string;
  shadowEvaluationContentHash: string;
  proposalId: string;
  proposalContentHash: string;
  reviewerRef: string;
  decision: OutcomeLearningAdoptionDecisionKind;
  decisionRationale: string;
  conditions: string[];
  evidenceRefs: string[];
  supersedesAdoptionDecisionId?: string;
  shadowEvaluationReviewed: true;
  rollbackPlanAcknowledged: true;
  humanDecisionConfirmed: true;
  governedChangePreparationAuthorized: boolean;
  automaticApplyAuthorized: false;
  ruleMutationAuthorized: false;
  edgeGateMutationAuthorized: false;
  codeMutationAuthorized: false;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type OutcomeLearningAdoptionReviewerContext = {
  kind: "human" | "ai";
};

export type OutcomeLearningAdoptionDecisionContext = {
  shadowEvaluationsById: ReadonlyMap<string, OutcomeLearningShadowEvaluationRecord>;
  validatedShadowEvaluationHashes: ReadonlySet<string>;
  proposalsById: ReadonlyMap<string, OutcomeLearningProposalRecord>;
  validatedProposalHashes: ReadonlySet<string>;
  reviewersByRef: ReadonlyMap<string, OutcomeLearningAdoptionReviewerContext>;
};

export type OutcomeLearningAdoptionDecisionIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const OUTCOME_LEARNING_ADOPTION_DECISION_PATHS = {
  records: "research/recommendations/outcome-learning-adoption-decisions.jsonl",
  schema: "research/schemas/outcome-learning-adoption-decision.schema.json",
} as const;

function issue(code: string, target: string, message: string): OutcomeLearningAdoptionDecisionIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: OutcomeLearningAdoptionDecisionRecord,
): Omit<OutcomeLearningAdoptionDecisionRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeOutcomeLearningAdoptionDecisionHash(
  record: OutcomeLearningAdoptionDecisionRecord | Omit<OutcomeLearningAdoptionDecisionRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withOutcomeLearningAdoptionDecisionHash(
  record: Omit<OutcomeLearningAdoptionDecisionRecord, "contentHash">,
): OutcomeLearningAdoptionDecisionRecord {
  return { ...record, contentHash: computeOutcomeLearningAdoptionDecisionHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?#&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)|(?:^|:\/\/)[^/?#\s:@]+:[^/?#\s@]+@/i.test(ref);
}

function canonicalLineage(input: {
  record: OutcomeLearningAdoptionDecisionRecord;
  context: OutcomeLearningAdoptionDecisionContext;
  issues: OutcomeLearningAdoptionDecisionIssue[];
}): { shadow?: OutcomeLearningShadowEvaluationRecord; proposal?: OutcomeLearningProposalRecord } {
  const target = `adoption-decision:${input.record.adoptionDecisionId}`;
  const shadow = input.context.shadowEvaluationsById.get(input.record.shadowEvaluationId);
  if (!shadow) {
    input.issues.push(issue("missing_shadow_evaluation", target, "参照Shadow Evaluationが見つかりません"));
  } else if (
    shadow.contentHash !== input.record.shadowEvaluationContentHash
    || computeOutcomeLearningShadowEvaluationHash(shadow) !== shadow.contentHash
  ) {
    input.issues.push(issue("shadow_evaluation_hash_mismatch", target, "Shadow Evaluation hash lineageが一致しません"));
  } else if (!input.context.validatedShadowEvaluationHashes.has(shadow.contentHash)) {
    input.issues.push(issue("shadow_evaluation_not_validated", target, "validator通過済みfinal Shadow Evaluation hash witnessが必要です"));
  }

  const proposal = input.context.proposalsById.get(input.record.proposalId);
  if (!proposal) {
    input.issues.push(issue("missing_learning_proposal", target, "参照Learning Proposalが見つかりません"));
  } else if (
    proposal.contentHash !== input.record.proposalContentHash
    || computeOutcomeLearningProposalHash(proposal) !== proposal.contentHash
  ) {
    input.issues.push(issue("learning_proposal_hash_mismatch", target, "Learning Proposal hash lineageが一致しません"));
  } else if (!input.context.validatedProposalHashes.has(proposal.contentHash)) {
    input.issues.push(issue("learning_proposal_not_validated", target, "validator通過済みLearning Proposal hash witnessが必要です"));
  }

  if (shadow && proposal) {
    if (
      shadow.proposalId !== proposal.proposalId
      || shadow.proposalContentHash !== proposal.contentHash
    ) {
      input.issues.push(issue("adoption_lineage_mismatch", target, "Shadow EvaluationとLearning Proposalのlineageが一致しません"));
    }
    if (shadow.evaluationStage !== "final") {
      input.issues.push(issue("shadow_evaluation_not_final", target, "Adoption Decisionにはfinal Shadow Evaluationが必要です"));
    }
  }

  return { shadow, proposal };
}

function decisionScopeIssues(
  record: OutcomeLearningAdoptionDecisionRecord,
  shadow: OutcomeLearningShadowEvaluationRecord,
  proposal: OutcomeLearningProposalRecord,
  context: OutcomeLearningAdoptionDecisionContext,
): OutcomeLearningAdoptionDecisionIssue[] {
  const target = `adoption-decision:${record.adoptionDecisionId}`;
  const issues: OutcomeLearningAdoptionDecisionIssue[] = [];

  if (Date.parse(record.decidedAt) <= Date.parse(shadow.evaluatedAt)) {
    issues.push(issue("adoption_time_not_after_shadow", target, "decidedAtはfinal Shadow Evaluation evaluatedAtより後である必要があります"));
  }

  const reviewer = context.reviewersByRef.get(record.reviewerRef);
  if (!reviewer) {
    issues.push(issue("unknown_adoption_reviewer", target, `reviewerRefがregistryにありません: ${record.reviewerRef}`));
  } else if (reviewer.kind !== "human") {
    issues.push(issue("adoption_reviewer_not_human", target, "Adoption Decisionはhuman reviewerのみ作成できます"));
  }
  if (secretLikeReference(record.reviewerRef)) {
    issues.push(issue("secret_like_reviewer_ref", target, "reviewerRefにsecret/tokenを含められません"));
  }

  const shadowEvidence = new Set(shadow.evidenceRefs);
  for (const ref of record.evidenceRefs) {
    if (secretLikeReference(ref)) {
      issues.push(issue("secret_like_adoption_evidence_ref", target, "Adoption Evidence refにsecret/tokenを含められません"));
    }
    if (!shadowEvidence.has(ref)) {
      issues.push(issue(
        "adoption_evidence_not_in_shadow",
        target,
        `Adoption Decision Evidenceはfinal Shadow Evaluation evidenceRefsから選ぶ必要があります: ${ref}`,
      ));
    }
  }

  if (record.decision === "approve_change_preparation") {
    if (shadow.verdict !== "supports_change") {
      issues.push(issue(
        "unsupported_change_preparation_approval",
        target,
        "approve_change_preparationにはfinal Shadow verdict=supports_changeが必要です",
      ));
    }
    if (!record.governedChangePreparationAuthorized) {
      issues.push(issue(
        "change_preparation_authorization_missing",
        target,
        "approve_change_preparationにはgovernedChangePreparationAuthorized=trueが必要です",
      ));
    }
  } else if (record.governedChangePreparationAuthorized) {
    issues.push(issue(
      "change_preparation_authorization_scope_violation",
      target,
      "defer/rejectではgovernedChangePreparationAuthorized=falseである必要があります",
    ));
  }

  if (record.decision === "defer" && record.conditions.length === 0) {
    issues.push(issue("defer_conditions_required", target, "deferには再判断条件を少なくとも1件残す必要があります"));
  }

  if (proposal.rollbackPlan.trim().length === 0) {
    issues.push(issue("missing_frozen_rollback_plan", target, "Learning Proposal rollbackPlanが空です"));
  }

  return issues;
}

export function validateOutcomeLearningAdoptionDecisionRecord(
  value: unknown,
  schema: JsonSchema,
  context: OutcomeLearningAdoptionDecisionContext,
): OutcomeLearningAdoptionDecisionIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "OutcomeLearningAdoptionDecisionRecord",
      error.message,
    ));
  }

  const record = value as OutcomeLearningAdoptionDecisionRecord;
  const target = `adoption-decision:${record.adoptionDecisionId}`;
  const issues: OutcomeLearningAdoptionDecisionIssue[] = [];
  if (record.contentHash !== computeOutcomeLearningAdoptionDecisionHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }

  const { shadow, proposal } = canonicalLineage({ record, context, issues });
  if (shadow && proposal) issues.push(...decisionScopeIssues(record, shadow, proposal, context));

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateOutcomeLearningAdoptionDecisionRecords(
  records: OutcomeLearningAdoptionDecisionRecord[],
  schema: JsonSchema,
  context: OutcomeLearningAdoptionDecisionContext,
): OutcomeLearningAdoptionDecisionIssue[] {
  const issues = records.flatMap((record) => validateOutcomeLearningAdoptionDecisionRecord(record, schema, context));
  const byId = new Map<string, OutcomeLearningAdoptionDecisionRecord>();
  const childrenByParent = new Map<string, string[]>();
  const rootByShadow = new Map<string, string>();

  for (const record of records) {
    if (byId.has(record.adoptionDecisionId)) {
      issues.push(issue("duplicate_adoption_decision_id", record.adoptionDecisionId, "adoptionDecisionIdが重複しています"));
    } else {
      byId.set(record.adoptionDecisionId, record);
    }

    if (record.supersedesAdoptionDecisionId) {
      const children = childrenByParent.get(record.supersedesAdoptionDecisionId) ?? [];
      children.push(record.adoptionDecisionId);
      childrenByParent.set(record.supersedesAdoptionDecisionId, children);
    } else {
      const priorRoot = rootByShadow.get(record.shadowEvaluationId);
      if (priorRoot) {
        issues.push(issue(
          "duplicate_adoption_decision_root",
          record.adoptionDecisionId,
          `1つのfinal Shadow Evaluationに複数root Adoption Decisionを作れません: ${priorRoot}`,
        ));
      } else {
        rootByShadow.set(record.shadowEvaluationId, record.adoptionDecisionId);
      }
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "adoption_decision_revision_fork",
        parentId,
        `Adoption Decision revisionを分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesAdoptionDecisionId) continue;
    const prior = byId.get(record.supersedesAdoptionDecisionId);
    if (!prior) {
      issues.push(issue("missing_superseded_adoption_decision", record.adoptionDecisionId, "supersedesAdoptionDecisionIdが見つかりません"));
      continue;
    }
    if (
      prior.shadowEvaluationId !== record.shadowEvaluationId
      || prior.shadowEvaluationContentHash !== record.shadowEvaluationContentHash
      || prior.proposalId !== record.proposalId
      || prior.proposalContentHash !== record.proposalContentHash
    ) {
      issues.push(issue(
        "adoption_decision_revision_identity_mismatch",
        record.adoptionDecisionId,
        "Adoption Decision revisionでShadow/Proposal identityを変更できません",
      ));
    }
    if (Date.parse(record.decidedAt) <= Date.parse(prior.decidedAt)) {
      issues.push(issue("adoption_decision_time_not_monotonic", record.adoptionDecisionId, "revision decidedAtは直前Decisionより後である必要があります"));
    }
    if (prior.decision !== "defer") {
      issues.push(issue(
        "terminal_adoption_decision_revised",
        record.adoptionDecisionId,
        "approve_change_preparation/rejectはterminalです。revisionできるのはdeferだけです",
      ));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseOutcomeLearningAdoptionDecisionJsonl(
  content: string,
  path = "<memory>",
): OutcomeLearningAdoptionDecisionRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as OutcomeLearningAdoptionDecisionRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readOutcomeLearningAdoptionDecisionJsonl(path: string): OutcomeLearningAdoptionDecisionRecord[] {
  if (!existsSync(path)) return [];
  return parseOutcomeLearningAdoptionDecisionJsonl(readFileSync(path, "utf-8"), path);
}

export function appendOutcomeLearningAdoptionDecisionRecords(input: {
  path: string;
  incoming: OutcomeLearningAdoptionDecisionRecord[];
  schema: JsonSchema;
  context: OutcomeLearningAdoptionDecisionContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readOutcomeLearningAdoptionDecisionJsonl(input.path);
  const errors = validateOutcomeLearningAdoptionDecisionRecords(
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
