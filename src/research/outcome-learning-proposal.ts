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
  computeOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewRecord,
} from "./outcome-semantic-review.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type OutcomeLearningProposalStage =
  | "draft_proposal"
  | "human_review_ready"
  | "rejected";

export type OutcomeLearningProposalTargetKind =
  | "research_rule"
  | "edge_gate"
  | "evidence_requirement"
  | "calibration"
  | "scoring"
  | "backtest_method"
  | "operational_guard";

export type OutcomeLearningProposalRecord = {
  schemaVersion: 1;
  proposalId: string;
  createdAt: string;
  semanticReviewId: string;
  semanticReviewContentHash: string;
  proposalStage: OutcomeLearningProposalStage;
  targetKind: OutcomeLearningProposalTargetKind;
  targetRef: string;
  problemStatement: string;
  proposedChange: string;
  rationale: string;
  expectedEffect: string;
  evaluationPlan: {
    method: string;
    successCriteria: string[];
    failureCriteria: string[];
    minimumEvidence: string[];
  };
  falsificationConditions: string[];
  rollbackPlan: string;
  evidenceRefs: string[];
  supersedesProposalId?: string;
  humanApprovalRequired: true;
  automaticApplyAuthorized: false;
  ruleMutationAuthorized: false;
  edgeGateMutationAuthorized: false;
  codeMutationAuthorized: false;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type OutcomeLearningProposalContext = {
  semanticReviewsById: ReadonlyMap<string, OutcomeSemanticReviewRecord>;
};

export type OutcomeLearningProposalIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const OUTCOME_LEARNING_PROPOSAL_PATHS = {
  records: "research/recommendations/outcome-learning-proposals.jsonl",
  schema: "research/schemas/outcome-learning-proposal.schema.json",
} as const;

function issue(code: string, target: string, message: string): OutcomeLearningProposalIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: OutcomeLearningProposalRecord,
): Omit<OutcomeLearningProposalRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeOutcomeLearningProposalHash(
  record: OutcomeLearningProposalRecord | Omit<OutcomeLearningProposalRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withOutcomeLearningProposalHash(
  record: Omit<OutcomeLearningProposalRecord, "contentHash">,
): OutcomeLearningProposalRecord {
  return { ...record, contentHash: computeOutcomeLearningProposalHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

function validateSourceReview(input: {
  record: OutcomeLearningProposalRecord;
  context: OutcomeLearningProposalContext;
  issues: OutcomeLearningProposalIssue[];
}): OutcomeSemanticReviewRecord | null {
  const target = `learning-proposal:${input.record.proposalId}`;
  const review = input.context.semanticReviewsById.get(input.record.semanticReviewId);
  if (!review) {
    input.issues.push(issue("missing_semantic_review", target, "参照Semantic Reviewが見つかりません"));
    return null;
  }
  if (
    review.contentHash !== input.record.semanticReviewContentHash
    || computeOutcomeSemanticReviewHash(review) !== review.contentHash
  ) {
    input.issues.push(issue("semantic_review_hash_mismatch", target, "Semantic Review hash lineageが一致しません"));
    return null;
  }
  return review;
}

function reviewScopeIssues(
  record: OutcomeLearningProposalRecord,
  review: OutcomeSemanticReviewRecord,
): OutcomeLearningProposalIssue[] {
  const target = `learning-proposal:${record.proposalId}`;
  const issues: OutcomeLearningProposalIssue[] = [];

  if (Date.parse(record.createdAt) < Date.parse(review.reviewedAt)) {
    issues.push(issue("proposal_before_semantic_review", target, "Learning ProposalはSemantic Reviewより前に作成できません"));
  }

  if (!review.proposedRuleChanges.includes(record.proposedChange)) {
    issues.push(issue(
      "proposal_change_not_in_semantic_review",
      target,
      "proposedChangeは参照Semantic Reviewで固定されたproposedRuleChangesの1件と完全一致する必要があります",
    ));
  }

  if (review.reviewAuthority === "provisional_ai") {
    if (record.proposalStage !== "draft_proposal") {
      issues.push(issue(
        "provisional_review_stage_violation",
        target,
        "AI provisional review由来Proposalはdraft_proposalに限定します",
      ));
    }
  } else if (record.proposalStage === "draft_proposal") {
    // Human-confirmed review may still produce a conservative draft; this is allowed.
  } else if (record.proposalStage !== "human_review_ready" && record.proposalStage !== "rejected") {
    issues.push(issue("invalid_human_proposal_stage", target, "human-confirmed review由来stageが不正です"));
  }

  const declaredEvidence = new Set(review.sourceEvidence.map((candidate) => candidate.ref));
  for (const ref of record.evidenceRefs) {
    if (secretLikeReference(ref)) {
      issues.push(issue("secret_like_evidence_ref", target, "secret/tokenを含む可能性があるEvidence refを保存できません"));
    }
    if (!declaredEvidence.has(ref)) {
      issues.push(issue(
        "proposal_evidence_not_in_semantic_review",
        target,
        `Proposal EvidenceはSemantic Review sourceEvidenceから選ぶ必要があります: ${ref}`,
      ));
    }
  }

  if (secretLikeReference(record.targetRef)) {
    issues.push(issue("secret_like_target_ref", target, "targetRefにsecret/tokenを含められません"));
  }

  return issues;
}

export function validateOutcomeLearningProposalRecord(
  value: unknown,
  schema: JsonSchema,
  context: OutcomeLearningProposalContext,
): OutcomeLearningProposalIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "OutcomeLearningProposalRecord",
      error.message,
    ));
  }

  const record = value as OutcomeLearningProposalRecord;
  const target = `learning-proposal:${record.proposalId}`;
  const issues: OutcomeLearningProposalIssue[] = [];
  if (record.contentHash !== computeOutcomeLearningProposalHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (!record.supersedesProposalId && record.proposalStage === "rejected") {
    issues.push(issue("root_proposal_rejected", target, "root Proposalをrejected状態から開始できません"));
  }

  const review = validateSourceReview({ record, context, issues });
  if (review) issues.push(...reviewScopeIssues(record, review));

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

const STAGE_RANK: Record<OutcomeLearningProposalStage, number> = {
  draft_proposal: 0,
  human_review_ready: 1,
  rejected: 2,
};

export function validateOutcomeLearningProposalRecords(
  records: OutcomeLearningProposalRecord[],
  schema: JsonSchema,
  context: OutcomeLearningProposalContext,
): OutcomeLearningProposalIssue[] {
  const issues = records.flatMap((record) => validateOutcomeLearningProposalRecord(record, schema, context));
  const byId = new Map<string, OutcomeLearningProposalRecord>();
  const childrenByParent = new Map<string, string[]>();
  const rootKeys = new Map<string, string>();

  for (const record of records) {
    if (byId.has(record.proposalId)) {
      issues.push(issue("duplicate_learning_proposal_id", record.proposalId, "proposalIdが重複しています"));
    } else {
      byId.set(record.proposalId, record);
    }

    if (record.supersedesProposalId) {
      const children = childrenByParent.get(record.supersedesProposalId) ?? [];
      children.push(record.proposalId);
      childrenByParent.set(record.supersedesProposalId, children);
    } else {
      const key = [
        record.semanticReviewId,
        record.targetKind,
        record.targetRef,
        record.proposedChange,
      ].join("|");
      const priorRoot = rootKeys.get(key);
      if (priorRoot) {
        issues.push(issue(
          "duplicate_learning_proposal_root",
          record.proposalId,
          `同じSemantic Review/target/changeに複数root Proposalを作れません: ${priorRoot}`,
        ));
      } else {
        rootKeys.set(key, record.proposalId);
      }
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "learning_proposal_revision_fork",
        parentId,
        `Learning Proposal revisionを分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesProposalId) continue;
    const prior = byId.get(record.supersedesProposalId);
    if (!prior) {
      issues.push(issue("missing_superseded_learning_proposal", record.proposalId, "supersedesProposalIdが見つかりません"));
      continue;
    }
    if (
      prior.semanticReviewId !== record.semanticReviewId
      || prior.semanticReviewContentHash !== record.semanticReviewContentHash
      || prior.targetKind !== record.targetKind
      || prior.targetRef !== record.targetRef
      || prior.proposedChange !== record.proposedChange
    ) {
      issues.push(issue(
        "learning_proposal_revision_identity_mismatch",
        record.proposalId,
        "revisionでsource review / target / proposedChangeを変更できません",
      ));
    }
    if (Date.parse(record.createdAt) <= Date.parse(prior.createdAt)) {
      issues.push(issue("learning_proposal_time_not_monotonic", record.proposalId, "revision createdAtは直前Proposalより後である必要があります"));
    }
    if (STAGE_RANK[record.proposalStage] < STAGE_RANK[prior.proposalStage]) {
      issues.push(issue("learning_proposal_stage_regressed", record.proposalId, "Proposal stageを後退できません"));
    }
    if (prior.proposalStage === "rejected") {
      issues.push(issue("rejected_proposal_is_terminal", record.proposalId, "rejected Proposalをさらにrevisionできません"));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseOutcomeLearningProposalJsonl(
  content: string,
  path = "<memory>",
): OutcomeLearningProposalRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as OutcomeLearningProposalRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readOutcomeLearningProposalJsonl(path: string): OutcomeLearningProposalRecord[] {
  if (!existsSync(path)) return [];
  return parseOutcomeLearningProposalJsonl(readFileSync(path, "utf-8"), path);
}

export function appendOutcomeLearningProposalRecords(input: {
  path: string;
  incoming: OutcomeLearningProposalRecord[];
  schema: JsonSchema;
  context: OutcomeLearningProposalContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readOutcomeLearningProposalJsonl(input.path);
  const errors = validateOutcomeLearningProposalRecords(
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
