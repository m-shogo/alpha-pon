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
  computeOutcomeLearningAdoptionDecisionHash,
  type OutcomeLearningAdoptionDecisionRecord,
} from "./outcome-learning-adoption-decision.js";
import {
  computeOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "./outcome-learning-proposal.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type ChangePreparationArtifactKind =
  | "code"
  | "config"
  | "schema"
  | "test"
  | "docs"
  | "data_contract";

export type ChangePreparationArtifact = {
  kind: ChangePreparationArtifactKind;
  path: string;
  purpose: string;
};

export type OutcomeLearningChangePreparationRecord = {
  schemaVersion: 1;
  manifestId: string;
  createdAt: string;
  preparedByRef: string;
  preparedByKind: "human" | "ai";
  adoptionDecisionId: string;
  adoptionDecisionContentHash: string;
  proposalId: string;
  proposalContentHash: string;
  preparationStage: "draft" | "ready_for_pr";
  targetKind: OutcomeLearningProposalRecord["targetKind"];
  targetRef: string;
  proposedChange: string;
  rollbackPlan: string;
  adoptionConditions: string[];
  plannedArtifacts: ChangePreparationArtifact[];
  validationRequirements: string[];
  explicitNonGoals: string[];
  supersedesManifestId?: string;
  implementationMode: "manual_pr_only";
  humanReviewRequired: true;
  pullRequestPreparationAuthorized: true;
  automaticApplyAuthorized: false;
  workflowMutationAuthorized: false;
  secretMutationAuthorized: false;
  billingMutationAuthorized: false;
  productionMutationAuthorized: false;
  ruleMutationAuthorized: false;
  edgeGateMutationAuthorized: false;
  codeMutationAuthorized: false;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type OutcomeLearningChangePreparationContext = {
  adoptionDecisionsById: ReadonlyMap<string, OutcomeLearningAdoptionDecisionRecord>;
  validatedAdoptionDecisionHashes: ReadonlySet<string>;
  proposalsById: ReadonlyMap<string, OutcomeLearningProposalRecord>;
  validatedProposalHashes: ReadonlySet<string>;
};

export type OutcomeLearningChangePreparationIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const OUTCOME_LEARNING_CHANGE_PREPARATION_PATHS = {
  records: "research/recommendations/outcome-learning-change-preparations.jsonl",
  schema: "research/schemas/outcome-learning-change-preparation.schema.json",
} as const;

function issue(code: string, target: string, message: string): OutcomeLearningChangePreparationIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(
  record: OutcomeLearningChangePreparationRecord,
): Omit<OutcomeLearningChangePreparationRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeOutcomeLearningChangePreparationHash(
  record: OutcomeLearningChangePreparationRecord | Omit<OutcomeLearningChangePreparationRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withOutcomeLearningChangePreparationHash(
  record: Omit<OutcomeLearningChangePreparationRecord, "contentHash">,
): OutcomeLearningChangePreparationRecord {
  return { ...record, contentHash: computeOutcomeLearningChangePreparationHash(record) };
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

function safeRepoPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function protectedPreparationPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return normalized === ".env"
    || normalized.startsWith(".env.")
    || normalized.startsWith(".github/")
    || normalized === "wrangler.toml"
    || normalized.includes("secret")
    || normalized.includes("credential")
    || normalized.includes("billing");
}

function canonicalLineage(input: {
  record: OutcomeLearningChangePreparationRecord;
  context: OutcomeLearningChangePreparationContext;
  issues: OutcomeLearningChangePreparationIssue[];
}): { adoption?: OutcomeLearningAdoptionDecisionRecord; proposal?: OutcomeLearningProposalRecord } {
  const target = `change-preparation:${input.record.manifestId}`;
  const adoption = input.context.adoptionDecisionsById.get(input.record.adoptionDecisionId);
  if (!adoption) {
    input.issues.push(issue("missing_adoption_decision", target, "参照Final Adoption Decisionが見つかりません"));
  } else if (
    adoption.contentHash !== input.record.adoptionDecisionContentHash
    || computeOutcomeLearningAdoptionDecisionHash(adoption) !== adoption.contentHash
  ) {
    input.issues.push(issue("adoption_decision_hash_mismatch", target, "Final Adoption Decision hash lineageが一致しません"));
  } else if (!input.context.validatedAdoptionDecisionHashes.has(adoption.contentHash)) {
    input.issues.push(issue("adoption_decision_not_validated", target, "validator通過済みFinal Adoption Decision hash witnessが必要です"));
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

  if (adoption && proposal) {
    if (
      adoption.proposalId !== proposal.proposalId
      || adoption.proposalContentHash !== proposal.contentHash
      || adoption.decision !== "approve_change_preparation"
      || !adoption.governedChangePreparationAuthorized
    ) {
      input.issues.push(issue(
        "change_preparation_not_authorized",
        target,
        "Change Preparationには同一Proposalをpinしたapprove_change_preparation Adoption Decisionが必要です",
      ));
    }
  }

  return { adoption, proposal };
}

function scopeIssues(
  record: OutcomeLearningChangePreparationRecord,
  adoption: OutcomeLearningAdoptionDecisionRecord,
  proposal: OutcomeLearningProposalRecord,
): OutcomeLearningChangePreparationIssue[] {
  const target = `change-preparation:${record.manifestId}`;
  const issues: OutcomeLearningChangePreparationIssue[] = [];

  if (Date.parse(record.createdAt) <= Date.parse(adoption.decidedAt)) {
    issues.push(issue("preparation_time_not_after_adoption", target, "createdAtはFinal Adoption decidedAtより後である必要があります"));
  }
  if (secretLikeReference(record.preparedByRef)) {
    issues.push(issue("secret_like_preparer_ref", target, "preparedByRefにsecret/tokenを含められません"));
  }
  if (
    record.targetKind !== proposal.targetKind
    || record.targetRef !== proposal.targetRef
    || record.proposedChange !== proposal.proposedChange
    || record.rollbackPlan !== proposal.rollbackPlan
  ) {
    issues.push(issue(
      "preparation_scope_drift",
      target,
      "target/proposedChange/rollbackPlanはadopt済みLearning Proposalと完全一致する必要があります",
    ));
  }
  if (stableStringify(record.adoptionConditions) !== stableStringify(adoption.conditions)) {
    issues.push(issue(
      "adoption_conditions_drift",
      target,
      "adoptionConditionsはFinal Adoption Decision conditionsと順序を含め完全一致する必要があります",
    ));
  }

  const seenPaths = new Set<string>();
  let hasImplementationArtifact = false;
  let hasTestArtifact = false;
  for (const artifact of record.plannedArtifacts) {
    if (!safeRepoPath(artifact.path)) {
      issues.push(issue("unsafe_planned_artifact_path", target, `repo-relative安全pathではありません: ${artifact.path}`));
    }
    if (protectedPreparationPath(artifact.path)) {
      issues.push(issue("protected_planned_artifact_path", target, `保護scopeをChange Preparationへ含められません: ${artifact.path}`));
    }
    if (seenPaths.has(artifact.path)) {
      issues.push(issue("duplicate_planned_artifact_path", target, `planned artifact pathが重複しています: ${artifact.path}`));
    }
    seenPaths.add(artifact.path);
    if (["code", "config", "schema", "data_contract"].includes(artifact.kind)) hasImplementationArtifact = true;
    if (artifact.kind === "test") hasTestArtifact = true;
  }

  if (record.preparationStage === "ready_for_pr" && hasImplementationArtifact && !hasTestArtifact) {
    issues.push(issue(
      "ready_preparation_missing_test_artifact",
      target,
      "code/config/schema/data_contractを含むready_for_pr Manifestにはtest artifactが必要です",
    ));
  }

  if (record.preparationStage === "ready_for_pr" && record.validationRequirements.length === 0) {
    issues.push(issue("ready_preparation_missing_validation", target, "ready_for_prにはvalidationRequirementsが必要です"));
  }

  return issues;
}

export function validateOutcomeLearningChangePreparationRecord(
  value: unknown,
  schema: JsonSchema,
  context: OutcomeLearningChangePreparationContext,
): OutcomeLearningChangePreparationIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "OutcomeLearningChangePreparationRecord",
      error.message,
    ));
  }

  const record = value as OutcomeLearningChangePreparationRecord;
  const target = `change-preparation:${record.manifestId}`;
  const issues: OutcomeLearningChangePreparationIssue[] = [];
  if (record.contentHash !== computeOutcomeLearningChangePreparationHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (!record.supersedesManifestId && record.preparationStage !== "draft") {
    issues.push(issue("root_preparation_must_be_draft", target, "root Change Preparation Manifestはdraftから開始する必要があります"));
  }

  const { adoption, proposal } = canonicalLineage({ record, context, issues });
  if (adoption && proposal) issues.push(...scopeIssues(record, adoption, proposal));

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateOutcomeLearningChangePreparationRecords(
  records: OutcomeLearningChangePreparationRecord[],
  schema: JsonSchema,
  context: OutcomeLearningChangePreparationContext,
): OutcomeLearningChangePreparationIssue[] {
  const issues = records.flatMap((record) => validateOutcomeLearningChangePreparationRecord(record, schema, context));
  const byId = new Map<string, OutcomeLearningChangePreparationRecord>();
  const childrenByParent = new Map<string, string[]>();
  const rootByAdoption = new Map<string, string>();

  for (const record of records) {
    if (byId.has(record.manifestId)) {
      issues.push(issue("duplicate_change_preparation_id", record.manifestId, "manifestIdが重複しています"));
    } else {
      byId.set(record.manifestId, record);
    }
    if (record.supersedesManifestId) {
      const children = childrenByParent.get(record.supersedesManifestId) ?? [];
      children.push(record.manifestId);
      childrenByParent.set(record.supersedesManifestId, children);
    } else {
      const priorRoot = rootByAdoption.get(record.adoptionDecisionId);
      if (priorRoot) {
        issues.push(issue(
          "duplicate_change_preparation_root",
          record.manifestId,
          `1つのFinal Adoption Decisionに複数root Manifestを作れません: ${priorRoot}`,
        ));
      } else {
        rootByAdoption.set(record.adoptionDecisionId, record.manifestId);
      }
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "change_preparation_revision_fork",
        parentId,
        `Change Preparation revisionを分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesManifestId) continue;
    const prior = byId.get(record.supersedesManifestId);
    if (!prior) {
      issues.push(issue("missing_superseded_change_preparation", record.manifestId, "supersedesManifestIdが見つかりません"));
      continue;
    }
    if (
      prior.adoptionDecisionId !== record.adoptionDecisionId
      || prior.adoptionDecisionContentHash !== record.adoptionDecisionContentHash
      || prior.proposalId !== record.proposalId
      || prior.proposalContentHash !== record.proposalContentHash
      || prior.targetKind !== record.targetKind
      || prior.targetRef !== record.targetRef
      || prior.proposedChange !== record.proposedChange
      || prior.rollbackPlan !== record.rollbackPlan
    ) {
      issues.push(issue(
        "change_preparation_revision_identity_mismatch",
        record.manifestId,
        "Manifest revisionでAdoption/Proposal/target/change/rollback identityを変更できません",
      ));
    }
    if (Date.parse(record.createdAt) <= Date.parse(prior.createdAt)) {
      issues.push(issue("change_preparation_time_not_monotonic", record.manifestId, "revision createdAtは直前Manifestより後である必要があります"));
    }
    if (prior.preparationStage === "ready_for_pr") {
      issues.push(issue("ready_change_preparation_revised", record.manifestId, "ready_for_pr Manifestはterminalです"));
    }
    if (prior.preparationStage === "draft" && record.preparationStage === "draft") {
      // Conservative draft refinement is allowed.
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseOutcomeLearningChangePreparationJsonl(
  content: string,
  path = "<memory>",
): OutcomeLearningChangePreparationRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as OutcomeLearningChangePreparationRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readOutcomeLearningChangePreparationJsonl(path: string): OutcomeLearningChangePreparationRecord[] {
  if (!existsSync(path)) return [];
  return parseOutcomeLearningChangePreparationJsonl(readFileSync(path, "utf-8"), path);
}

export function appendOutcomeLearningChangePreparationRecords(input: {
  path: string;
  incoming: OutcomeLearningChangePreparationRecord[];
  schema: JsonSchema;
  context: OutcomeLearningChangePreparationContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readOutcomeLearningChangePreparationJsonl(input.path);
  const errors = validateOutcomeLearningChangePreparationRecords(
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
