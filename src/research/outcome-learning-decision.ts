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
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type OutcomeLearningDecisionKind = "defer" | "advance_to_shadow" | "reject";

export type OutcomeLearningDecisionRecord = {
  schemaVersion: 1;
  decisionId: string;
  decidedAt: string;
  proposalId: string;
  proposalContentHash: string;
  reviewerRef: string;
  decision: OutcomeLearningDecisionKind;
  decisionRationale: string;
  conditions: string[];
  evidenceRefs: string[];
  supersedesDecisionId?: string;
  proposalReviewed: true;
  evaluationPlanAcknowledged: true;
  rollbackPlanAcknowledged: true;
  humanDecisionConfirmed: true;
  shadowEvaluationAuthorized: boolean;
  automaticApplyAuthorized: false;
  ruleMutationAuthorized: false;
  edgeGateMutationAuthorized: false;
  codeMutationAuthorized: false;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type OutcomeLearningDecisionReviewerContext = {
  kind: "human" | "ai";
};

export type OutcomeLearningDecisionContext = {
  proposalsById: ReadonlyMap<string, OutcomeLearningProposalRecord>;
  validatedProposalHashes: ReadonlySet<string>;
  reviewersByRef: ReadonlyMap<string, OutcomeLearningDecisionReviewerContext>;
};

export type OutcomeLearningDecisionIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const OUTCOME_LEARNING_DECISION_PATHS = {
  records: "research/recommendations/outcome-learning-decisions.jsonl",
  schema: "research/schemas/outcome-learning-decision.schema.json",
} as const;

function issue(code: string, target: string, message: string): OutcomeLearningDecisionIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: OutcomeLearningDecisionRecord,
): Omit<OutcomeLearningDecisionRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeOutcomeLearningDecisionHash(
  record: OutcomeLearningDecisionRecord | Omit<OutcomeLearningDecisionRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withOutcomeLearningDecisionHash(
  record: Omit<OutcomeLearningDecisionRecord, "contentHash">,
): OutcomeLearningDecisionRecord {
  return { ...record, contentHash: computeOutcomeLearningDecisionHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

function canonicalProposal(input: {
  record: OutcomeLearningDecisionRecord;
  context: OutcomeLearningDecisionContext;
  issues: OutcomeLearningDecisionIssue[];
}): OutcomeLearningProposalRecord | null {
  const target = `learning-decision:${input.record.decisionId}`;
  const proposal = input.context.proposalsById.get(input.record.proposalId);
  if (!proposal) {
    input.issues.push(issue("missing_learning_proposal", target, "参照Learning Proposalが見つかりません"));
    return null;
  }
  if (
    proposal.contentHash !== input.record.proposalContentHash
    || computeOutcomeLearningProposalHash(proposal) !== proposal.contentHash
  ) {
    input.issues.push(issue("learning_proposal_hash_mismatch", target, "Learning Proposal hash lineageが一致しません"));
    return null;
  }
  if (!input.context.validatedProposalHashes.has(proposal.contentHash)) {
    input.issues.push(issue(
      "learning_proposal_not_validated",
      target,
      "Human Decisionのsourceにはvalidator通過済みLearning Proposal hash witnessが必要です",
    ));
    return null;
  }
  return proposal;
}

function decisionScopeIssues(
  record: OutcomeLearningDecisionRecord,
  proposal: OutcomeLearningProposalRecord,
  context: OutcomeLearningDecisionContext,
): OutcomeLearningDecisionIssue[] {
  const target = `learning-decision:${record.decisionId}`;
  const issues: OutcomeLearningDecisionIssue[] = [];

  const humanReviewReady = proposal.proposalStage === "human_review_ready";
  const rejectableAiDraft = proposal.proposalStage === "draft_proposal" && record.decision === "reject";
  if (!humanReviewReady && !rejectableAiDraft) {
    issues.push(issue(
      "proposal_not_human_review_ready",
      target,
      "defer/advance_to_shadowにはhuman_review_ready Proposalが必要です。draft_proposalは人間によるrejectのみ許可します",
    ));
  }
  if (Date.parse(record.decidedAt) <= Date.parse(proposal.createdAt)) {
    issues.push(issue("decision_time_not_after_proposal", target, "decidedAtはProposal createdAtより後である必要があります"));
  }

  const reviewer = context.reviewersByRef.get(record.reviewerRef);
  if (!reviewer) {
    issues.push(issue("unknown_decision_reviewer", target, `reviewerRefがregistryにありません: ${record.reviewerRef}`));
  } else if (reviewer.kind !== "human") {
    issues.push(issue("decision_reviewer_not_human", target, "Learning Decisionはhuman reviewerのみ作成できます"));
  }
  if (secretLikeReference(record.reviewerRef)) {
    issues.push(issue("secret_like_reviewer_ref", target, "reviewerRefにsecret/tokenを含められません"));
  }

  const proposalEvidence = new Set(proposal.evidenceRefs);
  for (const ref of record.evidenceRefs) {
    if (secretLikeReference(ref)) {
      issues.push(issue("secret_like_decision_evidence_ref", target, "Evidence refにsecret/tokenを含められません"));
    }
    if (!proposalEvidence.has(ref)) {
      issues.push(issue(
        "decision_evidence_not_in_proposal",
        target,
        `Decision Evidenceは固定済みProposal evidenceRefsから選ぶ必要があります: ${ref}`,
      ));
    }
  }

  if (record.decision === "advance_to_shadow") {
    if (!record.shadowEvaluationAuthorized) {
      issues.push(issue("shadow_authorization_missing", target, "advance_to_shadowにはshadowEvaluationAuthorized=trueが必要です"));
    }
  } else if (record.shadowEvaluationAuthorized) {
    issues.push(issue(
      "shadow_authorization_scope_violation",
      target,
      "defer/rejectではshadowEvaluationAuthorized=falseである必要があります",
    ));
  }

  return issues;
}

export function validateOutcomeLearningDecisionRecord(
  value: unknown,
  schema: JsonSchema,
  context: OutcomeLearningDecisionContext,
): OutcomeLearningDecisionIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "OutcomeLearningDecisionRecord",
      error.message,
    ));
  }

  const record = value as OutcomeLearningDecisionRecord;
  const target = `learning-decision:${record.decisionId}`;
  const issues: OutcomeLearningDecisionIssue[] = [];
  if (record.contentHash !== computeOutcomeLearningDecisionHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  const proposal = canonicalProposal({ record, context, issues });
  if (proposal) issues.push(...decisionScopeIssues(record, proposal, context));

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateOutcomeLearningDecisionRecords(
  records: OutcomeLearningDecisionRecord[],
  schema: JsonSchema,
  context: OutcomeLearningDecisionContext,
): OutcomeLearningDecisionIssue[] {
  const issues = records.flatMap((record) => validateOutcomeLearningDecisionRecord(record, schema, context));
  const byId = new Map<string, OutcomeLearningDecisionRecord>();
  const childrenByParent = new Map<string, string[]>();
  const rootByProposal = new Map<string, string>();

  for (const record of records) {
    if (byId.has(record.decisionId)) {
      issues.push(issue("duplicate_learning_decision_id", record.decisionId, "decisionIdが重複しています"));
    } else {
      byId.set(record.decisionId, record);
    }

    if (record.supersedesDecisionId) {
      const children = childrenByParent.get(record.supersedesDecisionId) ?? [];
      children.push(record.decisionId);
      childrenByParent.set(record.supersedesDecisionId, children);
    } else {
      const priorRoot = rootByProposal.get(record.proposalId);
      if (priorRoot) {
        issues.push(issue(
          "duplicate_learning_decision_root",
          record.decisionId,
          `1つのProposalに複数root Human Decisionを作れません: ${priorRoot}`,
        ));
      } else {
        rootByProposal.set(record.proposalId, record.decisionId);
      }
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "learning_decision_revision_fork",
        parentId,
        `Human Decision revisionを分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesDecisionId) continue;
    const prior = byId.get(record.supersedesDecisionId);
    if (!prior) {
      issues.push(issue("missing_superseded_learning_decision", record.decisionId, "supersedesDecisionIdが見つかりません"));
      continue;
    }
    if (
      prior.proposalId !== record.proposalId
      || prior.proposalContentHash !== record.proposalContentHash
    ) {
      issues.push(issue(
        "learning_decision_revision_identity_mismatch",
        record.decisionId,
        "Human Decision revisionでProposal identity/hashを変更できません",
      ));
    }
    if (Date.parse(record.decidedAt) <= Date.parse(prior.decidedAt)) {
      issues.push(issue("learning_decision_time_not_monotonic", record.decisionId, "revision decidedAtは直前Decisionより後である必要があります"));
    }
    if (prior.decision !== "defer") {
      issues.push(issue(
        "terminal_learning_decision_revised",
        record.decisionId,
        "advance_to_shadow/rejectはterminal Decisionです。revisionできるのはdeferだけです",
      ));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseOutcomeLearningDecisionJsonl(
  content: string,
  path = "<memory>",
): OutcomeLearningDecisionRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as OutcomeLearningDecisionRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readOutcomeLearningDecisionJsonl(path: string): OutcomeLearningDecisionRecord[] {
  if (!existsSync(path)) return [];
  return parseOutcomeLearningDecisionJsonl(readFileSync(path, "utf-8"), path);
}

export function appendOutcomeLearningDecisionRecords(input: {
  path: string;
  incoming: OutcomeLearningDecisionRecord[];
  schema: JsonSchema;
  context: OutcomeLearningDecisionContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readOutcomeLearningDecisionJsonl(input.path);
  const errors = validateOutcomeLearningDecisionRecords(
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
