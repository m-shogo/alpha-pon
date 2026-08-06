import { createHash } from "node:crypto";
import type { ClaimRecord } from "./claim-contradiction-graph.js";
import type { EvidencePackageManifest } from "./evidence-package-manifest.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type HypothesisClass =
  | "event_repricing"
  | "special_situation"
  | "governance_accounting"
  | "structural_growth"
  | "supply_chain"
  | "valuation_expectations"
  | "market_microstructure"
  | "other";

export type HypothesisDirection = "positive" | "negative" | "mixed" | "neutral";
export type HypothesisStatus = "draft" | "registered";

export type HypothesisMechanismStep = {
  stepId: string;
  ordinal: number;
  statement: string;
  inputClaimIds: string[];
  outputStatement: string;
};

export type HypothesisFalsificationCondition = {
  conditionId: string;
  statement: string;
  effect: "weakens" | "invalidates";
  checkBy: string;
  requiredEvidenceTypes: string[];
};

export type HypothesisEvaluationPlan = {
  primaryMetric:
    | "net_alpha"
    | "relative_return"
    | "event_classification_accuracy"
    | "fundamental_realization"
    | "drawdown_control"
    | "other";
  secondaryMetrics: string[];
  benchmarkRoles: Array<"issuer" | "topix" | "sector">;
  entryRule: string;
  horizonTradingDays: number;
  evaluationDelayDays: number;
  transactionCostModelVersion: string;
  corporateActionPolicyVersion: string;
  holdoutPolicy: "registered_holdout" | "walk_forward" | "out_of_sample_only";
};

export type TestableHypothesisRecord = {
  schemaVersion: 1;
  hypothesisId: string;
  candidateId: string;
  listedSecurityEntityId: string;
  evidencePackageId: string;
  evidencePackageHash: string;
  createdAt: string;
  informationCutoff: string;
  hypothesisClass: HypothesisClass;
  statement: string;
  expectedDirection: HypothesisDirection;
  factClaimIds: string[];
  assumptionClaimIds: string[];
  forecastClaimIds: string[];
  supportEvidenceIds: string[];
  documentChangeRefs: string[];
  mechanismSteps: HypothesisMechanismStep[];
  falsificationConditions: HypothesisFalsificationCondition[];
  evaluationPlan: HypothesisEvaluationPlan;
  status: HypothesisStatus;
  registeredAt?: string;
  supersedesHypothesisId?: string;
  modelVersion: string;
  ruleVersion: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type TestableHypothesisRecordInput = Omit<
  TestableHypothesisRecord,
  "contentHash"
>;

export type ScenarioType = "downside" | "base" | "upside" | "null_hypothesis";
export type ScenarioStatus = "draft" | "registered";

export type ScenarioTriggerCondition = {
  triggerId: string;
  statement: string;
  checkBy: string;
  evidenceTypes: string[];
};

export type ScenarioInvalidationCondition = {
  conditionId: string;
  statement: string;
  checkBy: string;
};

export type ScenarioOutcomeDimension = {
  dimension:
    | "revenue"
    | "profit"
    | "cash_flow"
    | "balance_sheet"
    | "governance"
    | "execution_timing"
    | "market_reaction"
    | "liquidity"
    | "other";
  direction: "positive" | "negative" | "mixed" | "neutral" | "unknown";
  rangeDescription: string;
  horizonTradingDays: number;
  evidenceRefs: string[];
};

export type HypothesisScenarioRecord = {
  schemaVersion: 1;
  scenarioId: string;
  hypothesisId: string;
  evidencePackageHash: string;
  createdAt: string;
  informationCutoff: string;
  scenarioType: ScenarioType;
  statement: string;
  assumptionClaimIds: string[];
  triggerConditions: ScenarioTriggerCondition[];
  invalidationConditions: ScenarioInvalidationCondition[];
  outcomeDimensions: ScenarioOutcomeDimension[];
  status: ScenarioStatus;
  registeredAt?: string;
  supersedesScenarioId?: string;
  ruleVersion: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type HypothesisScenarioRecordInput = Omit<
  HypothesisScenarioRecord,
  "contentHash"
>;

export type HypothesisScenarioSet = {
  schemaVersion: 1;
  scenarioSetId: string;
  hypothesisId: string;
  evidencePackageHash: string;
  createdAt: string;
  informationCutoff: string;
  requiredScenarioTypes: ScenarioType[];
  scenarioIds: string[];
  scenarioHashes: string[];
  status: ScenarioStatus;
  registeredAt?: string;
  blockers: string[];
  supersedesScenarioSetId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type HypothesisScenarioSetInput = Omit<
  HypothesisScenarioSet,
  "contentHash"
>;

export type HypothesisScenarioSetBuildRequest = {
  scenarioSetId: string;
  createdAt: string;
  registeredAt?: string;
  supersedesScenarioSetId?: string;
};

export type HypothesisScenarioIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type HypothesisScenarioSchemas = {
  hypothesis: JsonSchema;
  scenario: JsonSchema;
  scenarioSet: JsonSchema;
};

export const HYPOTHESIS_SCENARIO_PATHS = {
  hypotheses: "research/hypothesis_scenarios/hypotheses.jsonl",
  scenarios: "research/hypothesis_scenarios/scenarios.jsonl",
  scenarioSets: "research/hypothesis_scenarios/scenario-sets.jsonl",
  hypothesisSchema: "research/schemas/testable-hypothesis-record.schema.json",
  scenarioSchema: "research/schemas/hypothesis-scenario-record.schema.json",
  scenarioSetSchema: "research/schemas/hypothesis-scenario-set.schema.json",
} as const;

export const REQUIRED_SCENARIO_TYPES: readonly ScenarioType[] = [
  "base",
  "downside",
  "null_hypothesis",
  "upside",
] as const;

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutHypothesisHash(
  record: TestableHypothesisRecord,
): TestableHypothesisRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutScenarioHash(
  record: HypothesisScenarioRecord,
): HypothesisScenarioRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

function withoutSetHash(
  record: HypothesisScenarioSet,
): HypothesisScenarioSetInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeTestableHypothesisHash(
  record: TestableHypothesisRecord | TestableHypothesisRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutHypothesisHash(record) : record);
}

export function withTestableHypothesisHash(
  record: TestableHypothesisRecordInput,
): TestableHypothesisRecord {
  return { ...record, contentHash: computeTestableHypothesisHash(record) };
}

export function computeHypothesisScenarioHash(
  record: HypothesisScenarioRecord | HypothesisScenarioRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutScenarioHash(record) : record);
}

export function withHypothesisScenarioHash(
  record: HypothesisScenarioRecordInput,
): HypothesisScenarioRecord {
  return { ...record, contentHash: computeHypothesisScenarioHash(record) };
}

export function computeHypothesisScenarioSetHash(
  record: HypothesisScenarioSet | HypothesisScenarioSetInput,
): string {
  return hashValue("contentHash" in record ? withoutSetHash(record) : record);
}

function issue(
  code: string,
  target: string,
  message: string,
  severity: HypothesisScenarioIssue["severity"] = "error",
): HypothesisScenarioIssue {
  return { severity, code, target, message };
}

function sortIssues(issues: HypothesisScenarioIssue[]): HypothesisScenarioIssue[] {
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
): HypothesisScenarioIssue[] {
  return validate(value, schema).map((error) => issue(
    "schema_violation",
    error.path ? `${target}:${error.path}` : target,
    error.message,
  ));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function canonicalArrayIssues(
  values: string[],
  field: string,
): HypothesisScenarioIssue[] {
  const expected = sortedUnique(values);
  const valid =
    expected.length === values.length &&
    expected.every((value, index) => value === values[index]);
  return valid ? [] : [issue(
    "non_canonical_hypothesis_array",
    field,
    `${field} must be sorted and unique`,
  )];
}

function allHypothesisClaimIds(record: TestableHypothesisRecord): string[] {
  return sortedUnique([
    ...record.factClaimIds,
    ...record.assumptionClaimIds,
    ...record.forecastClaimIds,
  ]);
}

function overlapIssues(
  groups: Array<{ name: string; values: string[] }>,
  target: string,
): HypothesisScenarioIssue[] {
  const issues: HypothesisScenarioIssue[] = [];
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      const overlap = groups[left].values.filter((value) =>
        groups[right].values.includes(value),
      );
      if (overlap.length > 0) {
        issues.push(issue(
          "hypothesis_claim_class_overlap",
          target,
          `${groups[left].name}/${groups[right].name}: ${overlap.join(",")}`,
        ));
      }
    }
  }
  return issues;
}

function validateRegistrationTime(
  status: HypothesisStatus | ScenarioStatus,
  createdAt: string,
  registeredAt: string | undefined,
  target: string,
): HypothesisScenarioIssue[] {
  const issues: HypothesisScenarioIssue[] = [];
  if (status === "registered") {
    if (!registeredAt) {
      issues.push(issue("registered_record_without_registered_at", target, "registeredAt is required"));
    } else if (Date.parse(registeredAt) < Date.parse(createdAt)) {
      issues.push(issue(
        "registered_before_created",
        target,
        `${registeredAt} < ${createdAt}`,
      ));
    }
  } else if (registeredAt) {
    issues.push(issue(
      "draft_record_has_registered_at",
      target,
      "draft record cannot have registeredAt",
    ));
  }
  return issues;
}

export function validateTestableHypothesisRecord(
  record: TestableHypothesisRecord,
  schema: JsonSchema,
  evidencePackage: EvidencePackageManifest,
  claimById: ReadonlyMap<string, ClaimRecord>,
): HypothesisScenarioIssue[] {
  const target = `hypothesis:${record.hypothesisId}`;
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeTestableHypothesisHash(record)) {
    issues.push(issue("invalid_hypothesis_hash", target, "contentHash mismatch"));
  }
  if (Date.parse(record.createdAt) < Date.parse(record.informationCutoff)) {
    issues.push(issue(
      "hypothesis_created_before_cutoff",
      target,
      `${record.createdAt} < ${record.informationCutoff}`,
    ));
  }
  issues.push(...validateRegistrationTime(
    record.status,
    record.createdAt,
    record.registeredAt,
    target,
  ));

  if (
    record.evidencePackageId !== evidencePackage.packageId ||
    record.evidencePackageHash !== evidencePackage.contentHash ||
    record.candidateId !== evidencePackage.candidateId ||
    record.listedSecurityEntityId !== evidencePackage.listedSecurityEntityId ||
    record.informationCutoff !== evidencePackage.informationCutoff
  ) {
    issues.push(issue(
      "hypothesis_evidence_package_identity_mismatch",
      target,
      "hypothesis candidate/security/package/cutoff differs from Evidence Package",
    ));
  }
  if (
    record.status === "registered" &&
    (evidencePackage.status !== "complete" || evidencePackage.blockers.length > 0)
  ) {
    issues.push(issue(
      "registered_hypothesis_uses_incomplete_package",
      target,
      `packageStatus=${evidencePackage.status} blockers=${evidencePackage.blockers.join(",")}`,
    ));
  }

  const groups = [
    { name: "fact", values: record.factClaimIds },
    { name: "assumption", values: record.assumptionClaimIds },
    { name: "forecast", values: record.forecastClaimIds },
  ];
  issues.push(...overlapIssues(groups, target));
  for (const group of groups) {
    issues.push(...canonicalArrayIssues(group.values, `${target}.${group.name}ClaimIds`));
    for (const claimId of group.values) {
      if (!evidencePackage.claimIds.includes(claimId)) {
        issues.push(issue(
          "hypothesis_claim_not_in_package",
          target,
          claimId,
        ));
        continue;
      }
      const claim = claimById.get(claimId);
      if (!claim) {
        issues.push(issue("missing_hypothesis_claim", target, claimId));
      } else if (claim.claimClass !== group.name) {
        issues.push(issue(
          "hypothesis_claim_class_mismatch",
          target,
          `${claimId}: expected=${group.name} actual=${claim.claimClass}`,
        ));
      }
    }
  }
  for (const evidenceId of record.supportEvidenceIds) {
    if (!evidencePackage.supportEvidenceIds.includes(evidenceId)) {
      issues.push(issue(
        "hypothesis_support_evidence_not_in_package",
        target,
        evidenceId,
      ));
    }
  }
  for (const changeRef of record.documentChangeRefs) {
    if (!evidencePackage.claimEligibleChangeRefs.includes(changeRef)) {
      issues.push(issue(
        "hypothesis_document_change_not_in_package",
        target,
        changeRef,
      ));
    }
  }

  const allClaimIds = allHypothesisClaimIds(record);
  const ordinals = record.mechanismSteps.map((step) => step.ordinal).sort((a, b) => a - b);
  const stepIds = record.mechanismSteps.map((step) => step.stepId);
  if (new Set(stepIds).size !== stepIds.length) {
    issues.push(issue("duplicate_hypothesis_mechanism_step", target, "stepId duplicate"));
  }
  if (!ordinals.every((ordinal, index) => ordinal === index)) {
    issues.push(issue(
      "non_contiguous_hypothesis_mechanism",
      target,
      `ordinals=${ordinals.join(",")}`,
    ));
  }
  for (const step of record.mechanismSteps) {
    for (const claimId of step.inputClaimIds) {
      if (!allClaimIds.includes(claimId)) {
        issues.push(issue(
          "mechanism_step_uses_unregistered_claim",
          `${target}:${step.stepId}`,
          claimId,
        ));
      }
    }
  }

  const invalidating = record.falsificationConditions.filter(
    (condition) => condition.effect === "invalidates",
  );
  if (invalidating.length === 0) {
    issues.push(issue(
      "hypothesis_without_invalidating_condition",
      target,
      "at least one invalidating falsification condition is required",
    ));
  }
  for (const condition of record.falsificationConditions) {
    if (Date.parse(condition.checkBy) <= Date.parse(record.informationCutoff)) {
      issues.push(issue(
        "falsification_deadline_not_after_cutoff",
        `${target}:${condition.conditionId}`,
        condition.checkBy,
      ));
    }
  }
  if (record.status === "registered" && record.registeredAt) {
    const earliestCheck = Math.min(
      ...record.falsificationConditions.map((condition) => Date.parse(condition.checkBy)),
    );
    if (Date.parse(record.registeredAt) >= earliestCheck) {
      issues.push(issue(
        "hypothesis_registered_after_falsification_window",
        target,
        `${record.registeredAt} >= ${new Date(earliestCheck).toISOString()}`,
      ));
    }
  }
  if (
    record.status === "registered" &&
    !equalSets(record.evaluationPlan.benchmarkRoles, ["issuer", "topix", "sector"])
  ) {
    issues.push(issue(
      "registered_hypothesis_missing_benchmark_role",
      target,
      record.evaluationPlan.benchmarkRoles.join(","),
    ));
  }
  return sortIssues(issues);
}

function marketReactionDirection(
  record: HypothesisScenarioRecord,
): ScenarioOutcomeDimension["direction"] | undefined {
  return record.outcomeDimensions.find(
    (dimension) => dimension.dimension === "market_reaction",
  )?.direction;
}

export function validateHypothesisScenarioRecord(
  record: HypothesisScenarioRecord,
  schema: JsonSchema,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
): HypothesisScenarioIssue[] {
  const target = `scenario:${record.scenarioId}`;
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeHypothesisScenarioHash(record)) {
    issues.push(issue("invalid_hypothesis_scenario_hash", target, "contentHash mismatch"));
  }
  if (
    record.hypothesisId !== hypothesis.hypothesisId ||
    record.evidencePackageHash !== evidencePackage.contentHash ||
    record.informationCutoff !== hypothesis.informationCutoff ||
    record.informationCutoff !== evidencePackage.informationCutoff
  ) {
    issues.push(issue(
      "scenario_hypothesis_identity_mismatch",
      target,
      "scenario hypothesis/package/cutoff mismatch",
    ));
  }
  if (Date.parse(record.createdAt) < Date.parse(record.informationCutoff)) {
    issues.push(issue(
      "scenario_created_before_cutoff",
      target,
      `${record.createdAt} < ${record.informationCutoff}`,
    ));
  }
  issues.push(...validateRegistrationTime(
    record.status,
    record.createdAt,
    record.registeredAt,
    target,
  ));
  if (record.status === "registered" && hypothesis.status !== "registered") {
    issues.push(issue(
      "registered_scenario_uses_draft_hypothesis",
      target,
      hypothesis.status,
    ));
  }
  const allowedClaims = sortedUnique([
    ...hypothesis.assumptionClaimIds,
    ...hypothesis.forecastClaimIds,
  ]);
  for (const claimId of record.assumptionClaimIds) {
    if (!allowedClaims.includes(claimId)) {
      issues.push(issue(
        "scenario_uses_unregistered_assumption",
        target,
        claimId,
      ));
    }
  }
  for (const outcome of record.outcomeDimensions) {
    for (const evidenceId of outcome.evidenceRefs) {
      if (!evidencePackage.evidenceIds.includes(evidenceId)) {
        issues.push(issue(
          "scenario_outcome_evidence_not_in_package",
          target,
          evidenceId,
        ));
      }
    }
  }
  for (const condition of [
    ...record.triggerConditions,
    ...record.invalidationConditions,
  ]) {
    if (Date.parse(condition.checkBy) <= Date.parse(record.informationCutoff)) {
      issues.push(issue(
        "scenario_condition_deadline_not_after_cutoff",
        target,
        condition.checkBy,
      ));
    }
  }

  const marketDirection = marketReactionDirection(record);
  if (!marketDirection) {
    issues.push(issue(
      "scenario_without_market_reaction_dimension",
      target,
      record.scenarioType,
    ));
  } else if (record.scenarioType === "downside" && marketDirection !== "negative") {
    issues.push(issue(
      "downside_scenario_not_negative",
      target,
      marketDirection,
    ));
  } else if (record.scenarioType === "upside" && marketDirection !== "positive") {
    issues.push(issue(
      "upside_scenario_not_positive",
      target,
      marketDirection,
    ));
  } else if (
    record.scenarioType === "null_hypothesis" &&
    !["neutral", "unknown"].includes(marketDirection)
  ) {
    issues.push(issue(
      "null_scenario_has_directional_market_reaction",
      target,
      marketDirection,
    ));
  }
  return sortIssues(issues);
}

function deriveScenarioSetBlockers(
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
  scenarios: HypothesisScenarioRecord[],
): string[] {
  const blockers: string[] = [];
  const types = scenarios.map((scenario) => scenario.scenarioType);
  for (const type of REQUIRED_SCENARIO_TYPES) {
    const count = types.filter((value) => value === type).length;
    if (count === 0) blockers.push(`missing_scenario_type:${type}`);
    if (count > 1) blockers.push(`duplicate_scenario_type:${type}`);
  }
  if (scenarios.length !== REQUIRED_SCENARIO_TYPES.length) {
    blockers.push(`scenario_count:${scenarios.length}`);
  }
  if (hypothesis.status !== "registered") blockers.push("hypothesis_not_registered");
  if (evidencePackage.status !== "complete") blockers.push("evidence_package_not_complete");
  for (const scenario of scenarios) {
    if (scenario.status !== "registered") {
      blockers.push(`scenario_not_registered:${scenario.scenarioId}`);
    }
    if (
      scenario.hypothesisId !== hypothesis.hypothesisId ||
      scenario.evidencePackageHash !== evidencePackage.contentHash ||
      scenario.informationCutoff !== hypothesis.informationCutoff
    ) {
      blockers.push(`scenario_identity_mismatch:${scenario.scenarioId}`);
    }
  }
  return sortedUnique(blockers);
}

export function buildHypothesisScenarioSet(
  request: HypothesisScenarioSetBuildRequest,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
  scenarios: HypothesisScenarioRecord[],
): HypothesisScenarioSet {
  const blockers = deriveScenarioSetBlockers(
    hypothesis,
    evidencePackage,
    scenarios,
  );
  const status: ScenarioStatus = blockers.length === 0 ? "registered" : "draft";
  const input: HypothesisScenarioSetInput = {
    schemaVersion: 1,
    scenarioSetId: request.scenarioSetId,
    hypothesisId: hypothesis.hypothesisId,
    evidencePackageHash: evidencePackage.contentHash,
    createdAt: request.createdAt,
    informationCutoff: hypothesis.informationCutoff,
    requiredScenarioTypes: [...REQUIRED_SCENARIO_TYPES],
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId).sort(),
    scenarioHashes: scenarios.map((scenario) => scenario.contentHash).sort(),
    status,
    ...(status === "registered" && request.registeredAt
      ? { registeredAt: request.registeredAt }
      : {}),
    blockers,
    ...(request.supersedesScenarioSetId
      ? { supersedesScenarioSetId: request.supersedesScenarioSetId }
      : {}),
    automaticTradingAuthorized: false,
  };
  return { ...input, contentHash: computeHypothesisScenarioSetHash(input) };
}

export function validateHypothesisScenarioSet(
  record: HypothesisScenarioSet,
  schema: JsonSchema,
  request: HypothesisScenarioSetBuildRequest,
  hypothesis: TestableHypothesisRecord,
  evidencePackage: EvidencePackageManifest,
  scenarios: HypothesisScenarioRecord[],
): HypothesisScenarioIssue[] {
  const target = `scenario-set:${record.scenarioSetId}`;
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeHypothesisScenarioSetHash(record)) {
    issues.push(issue("invalid_hypothesis_scenario_set_hash", target, "contentHash mismatch"));
  }
  const expected = buildHypothesisScenarioSet(
    request,
    hypothesis,
    evidencePackage,
    scenarios,
  );
  if (stableStringify(record) !== stableStringify(expected)) {
    issues.push(issue(
      "hypothesis_scenario_set_mismatch",
      target,
      "scenario set differs from authoritative build",
    ));
  }
  issues.push(...canonicalArrayIssues(record.requiredScenarioTypes, `${target}.requiredScenarioTypes`));
  issues.push(...canonicalArrayIssues(record.scenarioIds, `${target}.scenarioIds`));
  issues.push(...canonicalArrayIssues(record.scenarioHashes, `${target}.scenarioHashes`));
  if (record.status === "registered") {
    if (!record.registeredAt) {
      issues.push(issue("registered_scenario_set_without_registered_at", target, "registeredAt required"));
    } else if (Date.parse(record.registeredAt) < Date.parse(record.createdAt)) {
      issues.push(issue("scenario_set_registered_before_created", target, record.registeredAt));
    }
  } else if (record.registeredAt) {
    issues.push(issue("draft_scenario_set_has_registered_at", target, record.registeredAt));
  }
  return sortIssues(issues);
}

export function parseHypothesisScenarioJsonl<T>(
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
