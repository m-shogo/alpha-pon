import assert from "node:assert/strict";
import { buildOwnerResearchHistoryMap } from "../../src/research/owner-history-map.js";
import type { ResearchState } from "../../src/research/types.js";

const snapshot = {
  researchItems: [],
  researchFamilies: [],
  relations: [],
  cases: [],
  researchComponents: [],
  lineages: [],
  studies: [
    {
      schemaVersion: 1,
      ontologyVersion: "research-knowledge-v1",
      id: "study-owner-safe-001",
      title: "Owner-safe verification study",
      mode: "confirmatory",
      status: "completed",
      createdAt: "2026-08-01T09:00:00+09:00",
      registeredAt: "2026-08-02T09:00:00+09:00",
      informationCutoff: "2026-08-01T08:59:59+09:00",
      purpose: "Verify whether the effect survives a predeclared comparison.",
      population: "Eligible governance-event cases",
      primaryMetric: "D+20 excess return",
      benchmarkSpec: "internal benchmark details that must stay out of Owner JSON",
      counterfactualPolicy: "internal counterfactual policy",
      confounderPolicy: "internal confounder policy",
      executionPolicy: "internal execution policy",
    },
  ],
  studyResults: [
    {
      schemaVersion: 1,
      ontologyVersion: "research-knowledge-v1",
      id: "study-result-owner-safe-001",
      studyId: "study-owner-safe-001",
      sampleManifestId: "sample-manifest-internal-001",
      createdAt: "2026-08-25T15:00:00+09:00",
      effectSummary: "Observed effect weakened after the predeclared comparison.",
      identificationQuality: "suggestive_causal",
      exploitability: "observed_effect_only",
      limitations: ["Small sample remains."],
      negativeFindings: ["insufficient_sample", "already_priced_in"],
    },
  ],
} as unknown as Parameters<typeof buildOwnerResearchHistoryMap>[0]["snapshot"];

const researchState: ResearchState = {
  edges: [],
  analogs: [],
  counterfactuals: [],
  confounders: [],
  checkpoint: null,
};

const result = buildOwnerResearchHistoryMap({
  snapshot,
  researchState,
  generatedAt: "2026-08-29T06:55:00Z",
});

assert.equal(result.counts.studies, 1);
assert.equal(result.counts.studyResults, 1);
assert.deepEqual(result.studies, [
  {
    id: "study-owner-safe-001",
    title: "Owner-safe verification study",
    mode: "confirmatory",
    status: "completed",
    createdAt: "2026-08-01T09:00:00+09:00",
    registeredAt: "2026-08-02T09:00:00+09:00",
    informationCutoff: "2026-08-01T08:59:59+09:00",
    purpose: "Verify whether the effect survives a predeclared comparison.",
    population: "Eligible governance-event cases",
    primaryMetric: "D+20 excess return",
  },
]);
assert.deepEqual(result.studyResults, [
  {
    id: "study-result-owner-safe-001",
    studyId: "study-owner-safe-001",
    createdAt: "2026-08-25T15:00:00+09:00",
    effectSummary: "Observed effect weakened after the predeclared comparison.",
    identificationQuality: "suggestive_causal",
    exploitability: "observed_effect_only",
    limitations: ["Small sample remains."],
    negativeFindings: ["insufficient_sample", "already_priced_in"],
  },
]);

const projectedStudy = result.studies[0] as unknown as Record<string, unknown>;
const projectedResult = result.studyResults[0] as unknown as Record<string, unknown>;
assert.equal("benchmarkSpec" in projectedStudy, false, "Study benchmark internals must stay out of Owner projection");
assert.equal("counterfactualPolicy" in projectedStudy, false, "Study counterfactual policy must stay out of Owner projection");
assert.equal("confounderPolicy" in projectedStudy, false, "Study confounder policy must stay out of Owner projection");
assert.equal("executionPolicy" in projectedStudy, false, "Study execution policy must stay out of Owner projection");
assert.equal("sampleManifestId" in projectedResult, false, "Study sample manifest identity must stay out of Owner projection");

console.log("research/owner history map: Study safe projection OK");
