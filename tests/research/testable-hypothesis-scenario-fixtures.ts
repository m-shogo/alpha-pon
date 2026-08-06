import {
  assessClaimForRecommendationAtCutoff,
  buildClaimGraphSnapshotGovernedAtCutoff,
} from "../../src/research/claim-contradiction-graph-governed.js";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
  type ClaimRecord,
} from "../../src/research/claim-contradiction-graph.js";
import {
  buildEvidencePackageManifestGoverned,
} from "../../src/research/evidence-package-governed.js";
import type {
  EvidencePackageContext,
  EvidencePackageManifest,
} from "../../src/research/evidence-package-manifest.js";
import {
  withHypothesisScenarioHash,
  withTestableHypothesisHash,
  type HypothesisScenarioRecord,
  type HypothesisScenarioRecordInput,
  type HypothesisScenarioSchemas,
  type ScenarioType,
  type TestableHypothesisRecord,
  type TestableHypothesisRecordInput,
} from "../../src/research/testable-hypothesis-scenario.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";
import {
  EVIDENCE_PACKAGE_CUTOFF,
  EVIDENCE_PACKAGE_EVIDENCE_ID,
  EVIDENCE_PACKAGE_ISSUER_ID,
  EVIDENCE_PACKAGE_SECURITY_ID,
} from "./evidence-package-fixtures.js";
import {
  governedEvidencePackageContext,
  governedEvidencePackageRequest,
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";

export const HYPOTHESIS_FACT_CLAIM_ID = "claim:hypothesis-fixture:fact";
export const HYPOTHESIS_ASSUMPTION_CLAIM_ID = "claim:hypothesis-fixture:assumption";
export const HYPOTHESIS_FORECAST_CLAIM_ID = "claim:hypothesis-fixture:forecast";
export const TESTABLE_HYPOTHESIS_ID = "hypothesis:fixture:event-repricing";

export const hypothesisScenarioSchemas: HypothesisScenarioSchemas = {
  hypothesis: loadCouncilSchema(
    "research/schemas/testable-hypothesis-record.schema.json",
  ),
  scenario: loadCouncilSchema(
    "research/schemas/hypothesis-scenario-record.schema.json",
  ),
  scenarioSet: loadCouncilSchema(
    "research/schemas/hypothesis-scenario-set.schema.json",
  ),
};

function claim(
  claimClass: ClaimRecord["claimClass"],
  claimId: string,
): ClaimRecord {
  return withClaimRecordHash({
    schemaVersion: 1,
    recordId: `${claimId}:record:001`,
    claimId,
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID],
    claimClass,
    statement: claimClass === "fact"
      ? "The issuer published an implementation schedule update."
      : claimClass === "assumption"
        ? "The market has not fully incorporated the revised schedule."
        : "Relative valuation may adjust after the schedule is executed.",
    status: "active",
    informationCutoff: "2026-08-06T00:02:00+09:00",
    effectiveFrom: "2026-08-06T00:02:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    falsificationConditions: claimClass === "fact"
      ? []
      : ["Official evidence or market data invalidates the statement."],
    unknownRefs: [],
    ...(claimClass === "forecast" ? { horizon: "20 trading days" } : {}),
    modelVersion: "claim-model-hypothesis-fixture-v1",
    ruleVersion: "claim-graph-v1",
  });
}

export function hypothesisClaimRecords(): ClaimRecord[] {
  return [
    claim("fact", HYPOTHESIS_FACT_CLAIM_ID),
    claim("assumption", HYPOTHESIS_ASSUMPTION_CLAIM_ID),
    claim("forecast", HYPOTHESIS_FORECAST_CLAIM_ID),
  ];
}

export function hypothesisEvidencePackageContext(): EvidencePackageContext {
  const base = governedEvidencePackageContext();
  const claims = hypothesisClaimRecords();
  const edges = claims.map((record, index) => withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: `claim-edge:hypothesis-fixture:support:${index}:record:001`,
    edgeId: `claim-edge:hypothesis-fixture:support:${index}`,
    fromKind: "evidence",
    fromId: EVIDENCE_PACKAGE_EVIDENCE_ID,
    toKind: "claim",
    toId: record.claimId,
    relationType: "supports",
    strength: "material",
    effectiveFrom: "2026-08-06T00:03:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    sourceEvidenceIds: [EVIDENCE_PACKAGE_EVIDENCE_ID],
  }));
  const claimSchemas = {
    claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
    edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
  };
  const knownEntityIds = new Set([
    EVIDENCE_PACKAGE_ISSUER_ID,
    EVIDENCE_PACKAGE_SECURITY_ID,
    ...base.securityMasterSnapshot.entities.map((entity) => entity.entityId),
  ]);
  const claimGraphSnapshot = buildClaimGraphSnapshotGovernedAtCutoff(
    claims,
    edges,
    claimSchemas,
    base.evidenceSnapshot,
    knownEntityIds,
  );
  const claimAssessments = claims.map((record) =>
    assessClaimForRecommendationAtCutoff(
      claims,
      edges,
      claimSchemas,
      base.evidenceSnapshot,
      record.claimId,
      knownEntityIds,
    ),
  );
  return {
    ...base,
    claimGraphSnapshot,
    claimAssessments,
  };
}

export function completeHypothesisEvidencePackage(): EvidencePackageManifest {
  return buildEvidencePackageManifestGoverned(
    governedEvidencePackageRequest({
      packageId: "evidence-package:hypothesis-fixture:001",
      candidateId: "candidate:hypothesis-fixture:001",
    }),
    hypothesisEvidencePackageContext(),
    governedEvidencePackageResolver(),
  );
}

export function testableHypothesis(
  overrides: Partial<TestableHypothesisRecordInput> = {},
): TestableHypothesisRecord {
  const evidencePackage = completeHypothesisEvidencePackage();
  return withTestableHypothesisHash({
    schemaVersion: 1,
    hypothesisId: TESTABLE_HYPOTHESIS_ID,
    candidateId: evidencePackage.candidateId,
    listedSecurityEntityId: evidencePackage.listedSecurityEntityId,
    evidencePackageId: evidencePackage.packageId,
    evidencePackageHash: evidencePackage.contentHash,
    createdAt: "2026-08-06T00:35:00+09:00",
    informationCutoff: EVIDENCE_PACKAGE_CUTOFF,
    hypothesisClass: "event_repricing",
    statement: "The revised implementation schedule may cause a measurable relative repricing after executable confirmation.",
    expectedDirection: "positive",
    factClaimIds: [HYPOTHESIS_FACT_CLAIM_ID],
    assumptionClaimIds: [HYPOTHESIS_ASSUMPTION_CLAIM_ID],
    forecastClaimIds: [HYPOTHESIS_FORECAST_CLAIM_ID],
    supportEvidenceIds: [EVIDENCE_PACKAGE_EVIDENCE_ID],
    documentChangeRefs: [],
    mechanismSteps: [
      {
        stepId: "mechanism:hypothesis-fixture:1",
        ordinal: 0,
        statement: "The official schedule update changes the executable event path.",
        inputClaimIds: [HYPOTHESIS_FACT_CLAIM_ID],
        outputStatement: "The event state is different from the previously expected state.",
      },
      {
        stepId: "mechanism:hypothesis-fixture:2",
        ordinal: 1,
        statement: "Incomplete market incorporation may produce a relative repricing window.",
        inputClaimIds: [
          HYPOTHESIS_ASSUMPTION_CLAIM_ID,
          HYPOTHESIS_FORECAST_CLAIM_ID,
        ],
        outputStatement: "The issuer may outperform the pinned benchmarks after execution.",
      },
    ],
    falsificationConditions: [
      {
        conditionId: "falsification:hypothesis-fixture:weakens",
        statement: "The event is delayed without a new executable date.",
        effect: "weakens",
        checkBy: "2026-09-01T15:00:00+09:00",
        requiredEvidenceTypes: ["exchange_disclosure", "company_ir"],
      },
      {
        conditionId: "falsification:hypothesis-fixture:invalidates",
        statement: "The issuer withdraws the implementation schedule or cancels the event.",
        effect: "invalidates",
        checkBy: "2026-09-15T15:00:00+09:00",
        requiredEvidenceTypes: ["exchange_disclosure", "company_ir"],
      },
    ],
    evaluationPlan: {
      primaryMetric: "net_alpha",
      secondaryMetrics: ["relative_return", "drawdown"],
      benchmarkRoles: ["issuer", "sector", "topix"],
      entryRule: "Use the first executable open after all package inputs are observable.",
      horizonTradingDays: 20,
      evaluationDelayDays: 2,
      transactionCostModelVersion: "transaction-cost-v1",
      corporateActionPolicyVersion: "corporate-action-v1",
      holdoutPolicy: "registered_holdout",
    },
    status: "registered",
    registeredAt: "2026-08-06T00:36:00+09:00",
    modelVersion: "hypothesis-model-v1",
    ruleVersion: "testable-hypothesis-v1",
    automaticTradingAuthorized: false,
    ...overrides,
  });
}

function scenarioDirection(type: ScenarioType) {
  if (type === "downside") return "negative" as const;
  if (type === "upside") return "positive" as const;
  return "neutral" as const;
}

export function hypothesisScenario(
  scenarioType: ScenarioType,
  overrides: Partial<HypothesisScenarioRecordInput> = {},
): HypothesisScenarioRecord {
  const hypothesis = testableHypothesis();
  return withHypothesisScenarioHash({
    schemaVersion: 1,
    scenarioId: `scenario:hypothesis-fixture:${scenarioType}`,
    hypothesisId: hypothesis.hypothesisId,
    evidencePackageHash: hypothesis.evidencePackageHash,
    createdAt: "2026-08-06T00:37:00+09:00",
    informationCutoff: hypothesis.informationCutoff,
    scenarioType,
    statement: `${scenarioType} scenario describes a falsifiable path without a target price.`,
    assumptionClaimIds: [
      HYPOTHESIS_ASSUMPTION_CLAIM_ID,
      HYPOTHESIS_FORECAST_CLAIM_ID,
    ],
    triggerConditions: [{
      triggerId: `trigger:hypothesis-fixture:${scenarioType}`,
      statement: `Observable evidence activates the ${scenarioType} path.`,
      checkBy: "2026-09-01T15:00:00+09:00",
      evidenceTypes: ["exchange_disclosure", "market_data"],
    }],
    invalidationConditions: [{
      conditionId: `scenario-invalidation:hypothesis-fixture:${scenarioType}`,
      statement: `Official evidence invalidates the ${scenarioType} path.`,
      checkBy: "2026-09-15T15:00:00+09:00",
    }],
    outcomeDimensions: [
      {
        dimension: "market_reaction",
        direction: scenarioDirection(scenarioType),
        rangeDescription: "Relative market reaction is evaluated against the pinned benchmark set.",
        horizonTradingDays: 20,
        evidenceRefs: [EVIDENCE_PACKAGE_EVIDENCE_ID],
      },
      {
        dimension: "execution_timing",
        direction: scenarioType === "downside" ? "negative" : "neutral",
        rangeDescription: "Execution timing is assessed from official event-state evidence.",
        horizonTradingDays: 20,
        evidenceRefs: [EVIDENCE_PACKAGE_EVIDENCE_ID],
      },
    ],
    status: "registered",
    registeredAt: "2026-08-06T00:38:00+09:00",
    ruleVersion: "hypothesis-scenario-v1",
    automaticTradingAuthorized: false,
    ...overrides,
  });
}

export function registeredScenarioSetRecords(): HypothesisScenarioRecord[] {
  return [
    hypothesisScenario("base"),
    hypothesisScenario("downside"),
    hypothesisScenario("null_hypothesis"),
    hypothesisScenario("upside"),
  ];
}

export function hypothesisClaimMap(): Map<string, ClaimRecord> {
  return new Map(hypothesisClaimRecords().map((record) => [record.claimId, record]));
}
