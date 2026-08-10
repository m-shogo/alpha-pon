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
  computeQuantitativeOutcomeHash,
  type QuantitativeOutcomeRecord,
} from "./quantitative-outcome.js";
import {
  computeRecommendationHash,
  type RecommendationEvidenceTier,
  type RecommendationRecord,
} from "./recommendation-persistence.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type SemanticReviewAuthority = "provisional_ai" | "human_confirmed";
export type SemanticReviewLearningUse = "proposal_only" | "human_confirmed";
export type SemanticReviewVerdict = "correct" | "partly_correct" | "incorrect" | "inconclusive";
export type SemanticInvalidationAssessment = "triggered" | "not_triggered" | "inconclusive";

export type SemanticAssumptionAssessment = {
  assumption: string;
  assessment: "correct" | "incorrect" | "inconclusive";
  evidenceRefs: string[];
};

export type SemanticConfounderFinding = {
  statement: string;
  evidenceRefs: string[];
};

export type OutcomeSemanticReviewRecord = {
  schemaVersion: 1;
  reviewId: string;
  recommendationId: string;
  recommendationContentHash: string;
  quantitativeOutcomeId: string;
  quantitativeOutcomeContentHash: string;
  reviewedAt: string;
  evidenceCutoff: string;
  reviewAuthority: SemanticReviewAuthority;
  reviewerRef: string;
  learningUse: SemanticReviewLearningUse;
  invalidationAssessment: SemanticInvalidationAssessment;
  triggeredInvalidationRules: string[];
  invalidationEvidenceRefs: string[];
  verdict: SemanticReviewVerdict;
  assumptionAssessments: SemanticAssumptionAssessment[];
  missingEvidence: string[];
  unexpectedConfounders: SemanticConfounderFinding[];
  lessons: string[];
  proposedRuleChanges: string[];
  sourceEvidence: Array<{ tier: RecommendationEvidenceTier; ref: string }>;
  supersedesReviewId?: string;
  ruleMutationAuthorized: false;
  edgeGateMutationAuthorized: false;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type SemanticReviewEvidenceContext = {
  tier: RecommendationEvidenceTier;
  observedAt: string;
};

export type SemanticReviewReviewerContext = {
  kind: "human" | "ai";
};

export type OutcomeSemanticReviewContext = {
  recommendationsById: ReadonlyMap<string, RecommendationRecord>;
  quantitativeOutcomesById: ReadonlyMap<string, QuantitativeOutcomeRecord>;
  evidenceByRef: ReadonlyMap<string, SemanticReviewEvidenceContext>;
  reviewersByRef: ReadonlyMap<string, SemanticReviewReviewerContext>;
};

export type OutcomeSemanticReviewIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const OUTCOME_SEMANTIC_REVIEW_PATHS = {
  records: "research/recommendations/outcome-semantic-reviews.jsonl",
  schema: "research/schemas/outcome-semantic-review.schema.json",
} as const;

function issue(code: string, target: string, message: string): OutcomeSemanticReviewIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: OutcomeSemanticReviewRecord,
): Omit<OutcomeSemanticReviewRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeOutcomeSemanticReviewHash(
  record: OutcomeSemanticReviewRecord | Omit<OutcomeSemanticReviewRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withOutcomeSemanticReviewHash(
  record: Omit<OutcomeSemanticReviewRecord, "contentHash">,
): OutcomeSemanticReviewRecord {
  return { ...record, contentHash: computeOutcomeSemanticReviewHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

function canonicalLineage(input: {
  record: OutcomeSemanticReviewRecord;
  context: OutcomeSemanticReviewContext;
  issues: OutcomeSemanticReviewIssue[];
}): { recommendation?: RecommendationRecord; outcome?: QuantitativeOutcomeRecord } {
  const target = `semantic-review:${input.record.reviewId}`;
  const recommendation = input.context.recommendationsById.get(input.record.recommendationId);
  if (!recommendation) {
    input.issues.push(issue("missing_recommendation", target, "参照RecommendationRecordが見つかりません"));
  } else if (
    recommendation.contentHash !== input.record.recommendationContentHash
    || computeRecommendationHash(recommendation) !== recommendation.contentHash
  ) {
    input.issues.push(issue("recommendation_hash_mismatch", target, "RecommendationRecord hash lineageが一致しません"));
  }

  const outcome = input.context.quantitativeOutcomesById.get(input.record.quantitativeOutcomeId);
  if (!outcome) {
    input.issues.push(issue("missing_quantitative_outcome", target, "参照QuantitativeOutcomeが見つかりません"));
  } else if (
    outcome.contentHash !== input.record.quantitativeOutcomeContentHash
    || computeQuantitativeOutcomeHash(outcome) !== outcome.contentHash
  ) {
    input.issues.push(issue("quantitative_outcome_hash_mismatch", target, "QuantitativeOutcome hash lineageが一致しません"));
  }

  if (recommendation && outcome) {
    if (
      outcome.recommendationId !== recommendation.recommendationId
      || outcome.recommendationContentHash !== recommendation.contentHash
    ) {
      input.issues.push(issue("review_lineage_mismatch", target, "RecommendationとQuantitativeOutcomeのlineageが一致しません"));
    }
  }

  return { recommendation, outcome };
}

function reviewerAuthorityIssues(
  record: OutcomeSemanticReviewRecord,
  context: OutcomeSemanticReviewContext,
): OutcomeSemanticReviewIssue[] {
  const target = `semantic-review:${record.reviewId}`;
  const issues: OutcomeSemanticReviewIssue[] = [];
  const reviewer = context.reviewersByRef.get(record.reviewerRef);
  if (!reviewer) {
    issues.push(issue("unknown_reviewer", target, `reviewerRefがreviewer registryにありません: ${record.reviewerRef}`));
    return issues;
  }

  if (record.reviewAuthority === "provisional_ai") {
    if (reviewer.kind !== "ai") {
      issues.push(issue("reviewer_authority_mismatch", target, "provisional_ai reviewはAI reviewerRefである必要があります"));
    }
    if (record.learningUse !== "proposal_only") {
      issues.push(issue("provisional_learning_scope_violation", target, "AI暫定reviewはlearningUse=proposal_onlyに固定します"));
    }
  } else {
    if (reviewer.kind !== "human") {
      issues.push(issue("reviewer_authority_mismatch", target, "human_confirmed reviewはhuman reviewerRefである必要があります"));
    }
    if (record.learningUse !== "human_confirmed") {
      issues.push(issue("human_learning_scope_mismatch", target, "human_confirmed reviewはlearningUse=human_confirmedが必要です"));
    }
  }
  return issues;
}

function evidenceIssues(
  record: OutcomeSemanticReviewRecord,
  context: OutcomeSemanticReviewContext,
): OutcomeSemanticReviewIssue[] {
  const target = `semantic-review:${record.reviewId}`;
  const issues: OutcomeSemanticReviewIssue[] = [];
  const declared = new Set(record.sourceEvidence.map((candidate) => candidate.ref));
  parseExplicitIso8601Instant(record.evidenceCutoff, "evidenceCutoff");

  for (const evidence of record.sourceEvidence) {
    if (secretLikeReference(evidence.ref)) {
      issues.push(issue("secret_like_evidence_ref", target, "secret/tokenを含む可能性があるEvidence refを保存できません"));
      continue;
    }
    const canonical = context.evidenceByRef.get(evidence.ref);
    if (!canonical) {
      issues.push(issue("unknown_evidence_ref", target, `未検証Evidence refです: ${evidence.ref}`));
      continue;
    }
    if (canonical.tier !== evidence.tier) {
      issues.push(issue("evidence_tier_mismatch", target, `Evidence tierが正本と一致しません: ${evidence.ref}`));
    }
    try {
      if (compareExplicitIso8601Instants(
        canonical.observedAt,
        record.evidenceCutoff,
        `Evidence ${evidence.ref}.observedAt`,
        "evidenceCutoff",
      ) > 0) {
        issues.push(issue("future_review_evidence", target, `evidenceCutoff後のEvidenceです: ${evidence.ref}`));
      }
    } catch {
      issues.push(issue(
        "invalid_review_evidence_observed_at",
        target,
        `Evidence observedAtが不正です: ${evidence.ref}`,
      ));
      continue;
    }
  }

  const usedRefs = [
    ...record.invalidationEvidenceRefs,
    ...record.assumptionAssessments.flatMap((candidate) => candidate.evidenceRefs),
    ...record.unexpectedConfounders.flatMap((candidate) => candidate.evidenceRefs),
  ];
  for (const ref of usedRefs) {
    if (!declared.has(ref)) {
      issues.push(issue("undeclared_finding_evidence", target, `findingがsourceEvidence未宣言refを参照しています: ${ref}`));
    }
  }

  return issues;
}

function semanticAssessmentIssues(
  record: OutcomeSemanticReviewRecord,
  recommendation: RecommendationRecord,
): OutcomeSemanticReviewIssue[] {
  const target = `semantic-review:${record.reviewId}`;
  const issues: OutcomeSemanticReviewIssue[] = [];
  const invalidationRules = new Set(recommendation.invalidationRules);

  for (const rule of record.triggeredInvalidationRules) {
    if (!invalidationRules.has(rule)) {
      issues.push(issue("unknown_invalidation_rule", target, `Recommendationに存在しないinvalidation ruleです: ${rule}`));
    }
  }

  if (record.invalidationAssessment === "triggered") {
    if (record.triggeredInvalidationRules.length === 0) {
      issues.push(issue("triggered_rule_missing", target, "triggered判定にはtriggeredInvalidationRulesが必要です"));
    }
    if (record.invalidationEvidenceRefs.length === 0) {
      issues.push(issue("invalidation_evidence_missing", target, "triggered判定にはEvidence refが必要です"));
    }
  } else if (record.invalidationAssessment === "not_triggered") {
    if (record.triggeredInvalidationRules.length > 0) {
      issues.push(issue("not_triggered_has_rules", target, "not_triggered判定でtriggered ruleを保存できません"));
    }
    if (record.invalidationEvidenceRefs.length === 0) {
      issues.push(issue("invalidation_evidence_missing", target, "not_triggered判定にも確認Evidence refが必要です"));
    }
  } else if (record.triggeredInvalidationRules.length > 0) {
    issues.push(issue("inconclusive_has_triggered_rules", target, "inconclusive判定でtriggered ruleを確定できません"));
  }

  const knownAssumptions = new Set(recommendation.evidenceSummary.assumptions);
  const seenAssumptions = new Set<string>();
  for (const assessment of record.assumptionAssessments) {
    if (!knownAssumptions.has(assessment.assumption)) {
      issues.push(issue("unknown_assumption", target, `Recommendationに固定されていないassumptionです: ${assessment.assumption}`));
    }
    if (seenAssumptions.has(assessment.assumption)) {
      issues.push(issue("duplicate_assumption_assessment", target, `同一assumptionを複数評価できません: ${assessment.assumption}`));
    }
    seenAssumptions.add(assessment.assumption);
  }

  if (
    record.verdict !== "inconclusive"
    && record.assumptionAssessments.length === 0
    && record.unexpectedConfounders.length === 0
    && record.invalidationAssessment === "inconclusive"
  ) {
    issues.push(issue("semantic_basis_missing", target, "非inconclusive verdictにはassumption/confounder/invalidationの意味解釈根拠が必要です"));
  }

  return issues;
}

export function validateOutcomeSemanticReviewRecord(
  value: unknown,
  schema: JsonSchema,
  context: OutcomeSemanticReviewContext,
): OutcomeSemanticReviewIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "OutcomeSemanticReviewRecord",
      error.message,
    ));
  }

  const record = value as OutcomeSemanticReviewRecord;
  const target = `semantic-review:${record.reviewId}`;
  const issues: OutcomeSemanticReviewIssue[] = [];

  if (record.contentHash !== computeOutcomeSemanticReviewHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (compareExplicitIso8601Instants(
    record.evidenceCutoff,
    record.reviewedAt,
    "semanticReview.evidenceCutoff",
    "semanticReview.reviewedAt",
  ) > 0) {
    issues.push(issue("evidence_cutoff_after_review", target, "evidenceCutoffはreviewedAt以前である必要があります"));
  }

  const lineage = canonicalLineage({ record, context, issues });
  if (lineage.outcome && compareExplicitIso8601Instants(
    record.evidenceCutoff,
    lineage.outcome.reviewedAt,
    "semanticReview.evidenceCutoff",
    "quantitativeOutcome.reviewedAt",
  ) < 0) {
    issues.push(issue("review_cutoff_before_quantitative_outcome", target, "semantic review evidenceCutoffはQuantitative Outcome reviewedAt以降である必要があります"));
  }
  if (lineage.outcome && compareExplicitIso8601Instants(
    record.reviewedAt,
    lineage.outcome.reviewedAt,
    "semanticReview.reviewedAt",
    "quantitativeOutcome.reviewedAt",
  ) < 0) {
    issues.push(issue("review_before_quantitative_outcome", target, "semantic reviewはQuantitative Outcomeより前に確定できません"));
  }

  issues.push(...reviewerAuthorityIssues(record, context));
  issues.push(...evidenceIssues(record, context));
  if (lineage.recommendation) {
    issues.push(...semanticAssessmentIssues(record, lineage.recommendation));
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateOutcomeSemanticReviewRecords(
  records: OutcomeSemanticReviewRecord[],
  schema: JsonSchema,
  context: OutcomeSemanticReviewContext,
): OutcomeSemanticReviewIssue[] {
  const issues = records.flatMap((record) => validateOutcomeSemanticReviewRecord(record, schema, context));
  const byId = new Map<string, OutcomeSemanticReviewRecord>();
  const rootsByRecommendation = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();

  for (const record of records) {
    if (byId.has(record.reviewId)) {
      issues.push(issue("duplicate_semantic_review_id", record.reviewId, "reviewIdが重複しています"));
    } else {
      byId.set(record.reviewId, record);
    }
    if (record.supersedesReviewId) {
      const children = childrenByParent.get(record.supersedesReviewId) ?? [];
      children.push(record.reviewId);
      childrenByParent.set(record.supersedesReviewId, children);
    } else {
      const roots = rootsByRecommendation.get(record.recommendationId) ?? [];
      roots.push(record.reviewId);
      rootsByRecommendation.set(record.recommendationId, roots);
    }
  }

  for (const [recommendationId, roots] of rootsByRecommendation) {
    if (roots.length > 1) {
      issues.push(issue(
        "multiple_semantic_review_roots",
        recommendationId,
        `同一Recommendationに複数root semantic reviewを作れません: ${roots.sort().join(", ")}`,
      ));
    }
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "semantic_review_revision_fork",
        parentId,
        `semantic review revisionを分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesReviewId) continue;
    const prior = byId.get(record.supersedesReviewId);
    if (!prior) {
      issues.push(issue("missing_superseded_semantic_review", record.reviewId, "supersedesReviewIdが見つかりません"));
      continue;
    }
    if (
      prior.recommendationId !== record.recommendationId
      || prior.recommendationContentHash !== record.recommendationContentHash
    ) {
      issues.push(issue("semantic_review_lineage_mismatch", record.reviewId, "revisionでRecommendation lineageを変更できません"));
    }
    if (compareExplicitIso8601Instants(
      record.reviewedAt,
      prior.reviewedAt,
      `semanticReview:${record.reviewId}.reviewedAt`,
      `semanticReview:${prior.reviewId}.reviewedAt`,
    ) <= 0) {
      issues.push(issue("semantic_review_time_not_monotonic", record.reviewId, "revision reviewedAtは直前reviewより後である必要があります"));
    }
    if (compareExplicitIso8601Instants(
      record.evidenceCutoff,
      prior.evidenceCutoff,
      `semanticReview:${record.reviewId}.evidenceCutoff`,
      `semanticReview:${prior.reviewId}.evidenceCutoff`,
    ) < 0) {
      issues.push(issue("semantic_review_cutoff_regressed", record.reviewId, "revisionでevidenceCutoffを過去へ戻せません"));
    }
    if (prior.reviewAuthority === "human_confirmed" && record.reviewAuthority !== "human_confirmed") {
      issues.push(issue("semantic_review_authority_regressed", record.reviewId, "human_confirmed reviewをAI provisionalへ戻せません"));
    }

    const priorOutcome = context.quantitativeOutcomesById.get(prior.quantitativeOutcomeId);
    const currentOutcome = context.quantitativeOutcomesById.get(record.quantitativeOutcomeId);
    if (priorOutcome && currentOutcome && compareExplicitIso8601Instants(
      currentOutcome.reviewedAt,
      priorOutcome.reviewedAt,
      `quantitativeOutcome:${currentOutcome.outcomeId}.reviewedAt`,
      `quantitativeOutcome:${priorOutcome.outcomeId}.reviewedAt`,
    ) < 0) {
      issues.push(issue("quantitative_outcome_lineage_regressed", record.reviewId, "revisionでより古いQuantitative Outcomeへ戻せません"));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseOutcomeSemanticReviewJsonl(
  content: string,
  path = "<memory>",
): OutcomeSemanticReviewRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as OutcomeSemanticReviewRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readOutcomeSemanticReviewJsonl(path: string): OutcomeSemanticReviewRecord[] {
  if (!existsSync(path)) return [];
  return parseOutcomeSemanticReviewJsonl(readFileSync(path, "utf-8"), path);
}

export function appendOutcomeSemanticReviewRecords(input: {
  path: string;
  incoming: OutcomeSemanticReviewRecord[];
  schema: JsonSchema;
  context: OutcomeSemanticReviewContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readOutcomeSemanticReviewJsonl(input.path);
  const errors = validateOutcomeSemanticReviewRecords(
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
