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
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";
import {
  computeOutcomeLearningDecisionHash,
  type OutcomeLearningDecisionRecord,
} from "./outcome-learning-decision.js";
import {
  computeOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "./outcome-learning-proposal.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type ShadowCriterionAssessment = {
  criterion: string;
  assessment: "met" | "not_met" | "inconclusive";
  evidenceRefs: string[];
};

export type OutcomeLearningShadowEvaluationRecord = {
  schemaVersion: 1;
  evaluationId: string;
  evaluatedAt: string;
  evidenceCutoff: string;
  decisionId: string;
  decisionContentHash: string;
  proposalId: string;
  proposalContentHash: string;
  evaluationStage: "interim" | "final";
  evaluationMethod: string;
  successCriteriaAssessments: ShadowCriterionAssessment[];
  failureCriteriaAssessments: ShadowCriterionAssessment[];
  minimumEvidenceAssessments: ShadowCriterionAssessment[];
  falsificationAssessments: ShadowCriterionAssessment[];
  evidenceRefs: string[];
  verdict: "supports_change" | "rejects_change" | "inconclusive";
  supersedesEvaluationId?: string;
  humanReviewRequired: true;
  automaticApplyAuthorized: false;
  ruleMutationAuthorized: false;
  edgeGateMutationAuthorized: false;
  codeMutationAuthorized: false;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type ShadowEvaluationEvidenceContext = {
  observedAt: string;
};

export type OutcomeLearningShadowEvaluationContext = {
  decisionsById: ReadonlyMap<string, OutcomeLearningDecisionRecord>;
  validatedDecisionHashes: ReadonlySet<string>;
  proposalsById: ReadonlyMap<string, OutcomeLearningProposalRecord>;
  validatedProposalHashes: ReadonlySet<string>;
  evidenceByRef: ReadonlyMap<string, ShadowEvaluationEvidenceContext>;
  validatedEvidenceRefs: ReadonlySet<string>;
};

export type OutcomeLearningShadowEvaluationIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const OUTCOME_LEARNING_SHADOW_EVALUATION_PATHS = {
  records: "research/recommendations/outcome-learning-shadow-evaluations.jsonl",
  schema: "research/schemas/outcome-learning-shadow-evaluation.schema.json",
} as const;

function issue(code: string, target: string, message: string): OutcomeLearningShadowEvaluationIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: OutcomeLearningShadowEvaluationRecord,
): Omit<OutcomeLearningShadowEvaluationRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeOutcomeLearningShadowEvaluationHash(
  record: OutcomeLearningShadowEvaluationRecord | Omit<OutcomeLearningShadowEvaluationRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withOutcomeLearningShadowEvaluationHash(
  record: Omit<OutcomeLearningShadowEvaluationRecord, "contentHash">,
): OutcomeLearningShadowEvaluationRecord {
  return { ...record, contentHash: computeOutcomeLearningShadowEvaluationHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

function canonicalLineage(input: {
  record: OutcomeLearningShadowEvaluationRecord;
  context: OutcomeLearningShadowEvaluationContext;
  issues: OutcomeLearningShadowEvaluationIssue[];
}): { decision?: OutcomeLearningDecisionRecord; proposal?: OutcomeLearningProposalRecord } {
  const target = `shadow-evaluation:${input.record.evaluationId}`;
  const decision = input.context.decisionsById.get(input.record.decisionId);
  if (!decision) {
    input.issues.push(issue("missing_learning_decision", target, "参照Human Decisionが見つかりません"));
  } else if (
    decision.contentHash !== input.record.decisionContentHash
    || computeOutcomeLearningDecisionHash(decision) !== decision.contentHash
  ) {
    input.issues.push(issue("learning_decision_hash_mismatch", target, "Human Decision hash lineageが一致しません"));
  } else if (!input.context.validatedDecisionHashes.has(decision.contentHash)) {
    input.issues.push(issue("learning_decision_not_validated", target, "validator通過済みHuman Decision hash witnessが必要です"));
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

  if (decision && proposal) {
    if (
      decision.proposalId !== proposal.proposalId
      || decision.proposalContentHash !== proposal.contentHash
      || decision.decision !== "advance_to_shadow"
      || !decision.shadowEvaluationAuthorized
    ) {
      input.issues.push(issue(
        "shadow_lineage_not_authorized",
        target,
        "Shadow Evaluationには同一Proposalをpinしたterminal advance_to_shadow Human Decisionが必要です",
      ));
    }
  }

  return { decision, proposal };
}

function criterionOrderIssues(input: {
  target: string;
  label: string;
  expected: string[];
  actual: ShadowCriterionAssessment[];
}): OutcomeLearningShadowEvaluationIssue[] {
  const issues: OutcomeLearningShadowEvaluationIssue[] = [];
  if (input.actual.length !== input.expected.length) {
    issues.push(issue(
      "shadow_criteria_count_mismatch",
      input.target,
      `${input.label}の件数がfrozen Proposalと一致しません`,
    ));
    return issues;
  }
  for (let index = 0; index < input.expected.length; index += 1) {
    if (input.actual[index]?.criterion !== input.expected[index]) {
      issues.push(issue(
        "shadow_criterion_mismatch",
        input.target,
        `${input.label}[${index}]はfrozen Proposalのcriterionと完全一致する必要があります`,
      ));
    }
  }
  return issues;
}

function derivedVerdict(record: OutcomeLearningShadowEvaluationRecord): OutcomeLearningShadowEvaluationRecord["verdict"] {
  if (record.evaluationStage === "interim") return "inconclusive";

  const anyFailureMet = record.failureCriteriaAssessments.some((candidate) => candidate.assessment === "met");
  const anyFalsificationMet = record.falsificationAssessments.some((candidate) => candidate.assessment === "met");
  if (anyFailureMet || anyFalsificationMet) return "rejects_change";

  const allSuccessMet = record.successCriteriaAssessments.every((candidate) => candidate.assessment === "met");
  const allFailuresAbsent = record.failureCriteriaAssessments.every((candidate) => candidate.assessment === "not_met");
  const allMinimumEvidenceMet = record.minimumEvidenceAssessments.every((candidate) => candidate.assessment === "met");
  const allFalsificationAbsent = record.falsificationAssessments.every((candidate) => candidate.assessment === "not_met");

  return allSuccessMet && allFailuresAbsent && allMinimumEvidenceMet && allFalsificationAbsent
    ? "supports_change"
    : "inconclusive";
}

function evaluationScopeIssues(
  record: OutcomeLearningShadowEvaluationRecord,
  decision: OutcomeLearningDecisionRecord,
  proposal: OutcomeLearningProposalRecord,
  context: OutcomeLearningShadowEvaluationContext,
): OutcomeLearningShadowEvaluationIssue[] {
  const target = `shadow-evaluation:${record.evaluationId}`;
  const issues: OutcomeLearningShadowEvaluationIssue[] = [];

  if (compareExplicitIso8601Instants(
    record.evaluatedAt,
    decision.decidedAt,
    `${target}.evaluatedAt`,
    `Human Decision ${decision.decisionId}.decidedAt`,
  ) <= 0) {
    issues.push(issue("shadow_evaluation_not_after_decision", target, "evaluatedAtはHuman Decision decidedAtより後である必要があります"));
  }
  if (compareExplicitIso8601Instants(
    record.evidenceCutoff,
    decision.decidedAt,
    `${target}.evidenceCutoff`,
    `Human Decision ${decision.decisionId}.decidedAt`,
  ) < 0) {
    issues.push(issue("shadow_cutoff_before_decision", target, "evidenceCutoffはHuman Decision以前に戻せません"));
  }
  if (compareExplicitIso8601Instants(
    record.evidenceCutoff,
    record.evaluatedAt,
    `${target}.evidenceCutoff`,
    `${target}.evaluatedAt`,
  ) > 0) {
    issues.push(issue("shadow_cutoff_after_evaluation", target, "evidenceCutoffはevaluatedAtを超えられません"));
  }
  if (record.evaluationMethod !== proposal.evaluationPlan.method) {
    issues.push(issue("shadow_method_mismatch", target, "evaluationMethodはfrozen Proposal evaluationPlan.methodと完全一致が必要です"));
  }

  issues.push(...criterionOrderIssues({
    target,
    label: "successCriteria",
    expected: proposal.evaluationPlan.successCriteria,
    actual: record.successCriteriaAssessments,
  }));
  issues.push(...criterionOrderIssues({
    target,
    label: "failureCriteria",
    expected: proposal.evaluationPlan.failureCriteria,
    actual: record.failureCriteriaAssessments,
  }));
  issues.push(...criterionOrderIssues({
    target,
    label: "minimumEvidence",
    expected: proposal.evaluationPlan.minimumEvidence,
    actual: record.minimumEvidenceAssessments,
  }));
  issues.push(...criterionOrderIssues({
    target,
    label: "falsificationConditions",
    expected: proposal.falsificationConditions,
    actual: record.falsificationAssessments,
  }));

  const topEvidence = new Set(record.evidenceRefs);
  const proposalEvidence = new Set(proposal.evidenceRefs);
  const nestedEvidence = new Set<string>();
  const allAssessments = [
    ...record.successCriteriaAssessments,
    ...record.failureCriteriaAssessments,
    ...record.minimumEvidenceAssessments,
    ...record.falsificationAssessments,
  ];
  for (const assessment of allAssessments) {
    for (const ref of assessment.evidenceRefs) {
      nestedEvidence.add(ref);
      if (!topEvidence.has(ref)) {
        issues.push(issue("shadow_nested_evidence_not_declared", target, `criterion Evidenceがtop-level evidenceRefsにありません: ${ref}`));
      }
    }
  }

  parseExplicitIso8601Instant(record.evidenceCutoff, "shadow evidenceCutoff");
  for (const ref of record.evidenceRefs) {
    if (secretLikeReference(ref)) {
      issues.push(issue("secret_like_shadow_evidence_ref", target, "Shadow Evidence refにsecret/tokenを含められません"));
    }
    if (proposalEvidence.has(ref)) {
      issues.push(issue(
        "shadow_reuses_proposal_evidence",
        target,
        `Proposal作成EvidenceをShadow validation Evidenceとして再利用できません: ${ref}`,
      ));
    }
    const evidence = context.evidenceByRef.get(ref);
    if (!evidence) {
      issues.push(issue("missing_shadow_evidence", target, `Shadow Evidenceがcontextにありません: ${ref}`));
      continue;
    }
    if (!context.validatedEvidenceRefs.has(ref)) {
      issues.push(issue("shadow_evidence_not_validated", target, `validator通過済みShadow Evidence witnessがありません: ${ref}`));
    }
    try {
      parseExplicitIso8601Instant(
        evidence.observedAt,
        `Shadow Evidence ${ref}.observedAt`,
      );
    } catch {
      issues.push(issue(
        "invalid_shadow_evidence_observed_at",
        target,
        `Shadow Evidence observedAtが不正です: ${ref}`,
      ));
      continue;
    }
    if (compareExplicitIso8601Instants(
      evidence.observedAt,
      record.evidenceCutoff,
      `Shadow Evidence ${ref}.observedAt`,
      `${target}.evidenceCutoff`,
    ) > 0) {
      issues.push(issue("post_cutoff_shadow_evidence", target, `evidenceCutoff後のEvidenceを使えません: ${ref}`));
    }
    if (!nestedEvidence.has(ref)) {
      issues.push(issue("unused_shadow_evidence", target, `top-level Evidenceは少なくとも1 criterion assessmentで使う必要があります: ${ref}`));
    }
  }

  const expectedVerdict = derivedVerdict(record);
  if (record.verdict !== expectedVerdict) {
    issues.push(issue(
      "shadow_verdict_mismatch",
      target,
      `verdictはcriteriaから決定論的に${expectedVerdict}である必要があります`,
    ));
  }

  return issues;
}

export function validateOutcomeLearningShadowEvaluationRecord(
  value: unknown,
  schema: JsonSchema,
  context: OutcomeLearningShadowEvaluationContext,
): OutcomeLearningShadowEvaluationIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "OutcomeLearningShadowEvaluationRecord",
      error.message,
    ));
  }

  const record = value as OutcomeLearningShadowEvaluationRecord;
  const target = `shadow-evaluation:${record.evaluationId}`;
  const issues: OutcomeLearningShadowEvaluationIssue[] = [];
  if (record.contentHash !== computeOutcomeLearningShadowEvaluationHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }

  const { decision, proposal } = canonicalLineage({ record, context, issues });
  if (decision && proposal) issues.push(...evaluationScopeIssues(record, decision, proposal, context));

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateOutcomeLearningShadowEvaluationRecords(
  records: OutcomeLearningShadowEvaluationRecord[],
  schema: JsonSchema,
  context: OutcomeLearningShadowEvaluationContext,
): OutcomeLearningShadowEvaluationIssue[] {
  const issues = records.flatMap((record) => validateOutcomeLearningShadowEvaluationRecord(record, schema, context));
  const byId = new Map<string, OutcomeLearningShadowEvaluationRecord>();
  const childrenByParent = new Map<string, string[]>();
  const rootByDecision = new Map<string, string>();

  for (const record of records) {
    if (byId.has(record.evaluationId)) {
      issues.push(issue("duplicate_shadow_evaluation_id", record.evaluationId, "evaluationIdが重複しています"));
    } else {
      byId.set(record.evaluationId, record);
    }
    if (record.supersedesEvaluationId) {
      const children = childrenByParent.get(record.supersedesEvaluationId) ?? [];
      children.push(record.evaluationId);
      childrenByParent.set(record.supersedesEvaluationId, children);
    } else {
      const priorRoot = rootByDecision.get(record.decisionId);
      if (priorRoot) {
        issues.push(issue(
          "duplicate_shadow_evaluation_root",
          record.evaluationId,
          `1つのadvance Decisionに複数root Shadow Evaluationを作れません: ${priorRoot}`,
        ));
      } else {
        rootByDecision.set(record.decisionId, record.evaluationId);
      }
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "shadow_evaluation_revision_fork",
        parentId,
        `Shadow Evaluation revisionを分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesEvaluationId) continue;
    const prior = byId.get(record.supersedesEvaluationId);
    if (!prior) {
      issues.push(issue("missing_superseded_shadow_evaluation", record.evaluationId, "supersedesEvaluationIdが見つかりません"));
      continue;
    }
    if (
      prior.decisionId !== record.decisionId
      || prior.decisionContentHash !== record.decisionContentHash
      || prior.proposalId !== record.proposalId
      || prior.proposalContentHash !== record.proposalContentHash
    ) {
      issues.push(issue(
        "shadow_evaluation_revision_identity_mismatch",
        record.evaluationId,
        "Shadow Evaluation revisionでDecision/Proposal identityを変更できません",
      ));
    }
    if (compareExplicitIso8601Instants(
      record.evaluatedAt,
      prior.evaluatedAt,
      `Shadow Evaluation ${record.evaluationId}.evaluatedAt`,
      `Shadow Evaluation ${prior.evaluationId}.evaluatedAt`,
    ) <= 0) {
      issues.push(issue("shadow_evaluation_time_not_monotonic", record.evaluationId, "revision evaluatedAtは直前Evaluationより後である必要があります"));
    }
    if (compareExplicitIso8601Instants(
      record.evidenceCutoff,
      prior.evidenceCutoff,
      `Shadow Evaluation ${record.evaluationId}.evidenceCutoff`,
      `Shadow Evaluation ${prior.evaluationId}.evidenceCutoff`,
    ) < 0) {
      issues.push(issue("shadow_cutoff_regressed", record.evaluationId, "revision evidenceCutoffを後退できません"));
    }
    if (prior.evaluationStage === "final") {
      issues.push(issue("final_shadow_evaluation_revised", record.evaluationId, "final Shadow Evaluationはterminalです"));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseOutcomeLearningShadowEvaluationJsonl(
  content: string,
  path = "<memory>",
): OutcomeLearningShadowEvaluationRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as OutcomeLearningShadowEvaluationRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readOutcomeLearningShadowEvaluationJsonl(path: string): OutcomeLearningShadowEvaluationRecord[] {
  if (!existsSync(path)) return [];
  return parseOutcomeLearningShadowEvaluationJsonl(readFileSync(path, "utf-8"), path);
}

export function appendOutcomeLearningShadowEvaluationRecords(input: {
  path: string;
  incoming: OutcomeLearningShadowEvaluationRecord[];
  schema: JsonSchema;
  context: OutcomeLearningShadowEvaluationContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readOutcomeLearningShadowEvaluationJsonl(input.path);
  const errors = validateOutcomeLearningShadowEvaluationRecords(
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
