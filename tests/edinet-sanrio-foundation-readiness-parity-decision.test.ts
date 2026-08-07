import assert from "node:assert/strict";
import {
  assertSanrioFoundationParityDecisionConformance,
} from "../src/research/edinet-sanrio-foundation-readiness-parity-decision.js";

type JsonObject = Record<string, unknown>;

function fixture(): JsonObject {
  return {
    schemaVersion: 1,
    source: "edinet",
    reviewStatus: "complete_human_parity_review",
    inventoryAuditHumanConfirmed: true,
    mappingCount: 1,
    completedMappingCount: 1,
    coverageCount: 1,
    completedCoverageCount: 1,
    materiallyInconsistentMappingCount: 0,
    blockingCoverageCount: 0,
    insufficientEvidenceCount: 0,
    mappings: [{
      legacy: { anchorId: "legacy:001" },
      sameDocumentConfiguredAnchorIds: ["configured:001"],
      selectedConfiguredAnchorIds: ["configured:001"],
      machineRelation: "exact_structured_hash_match",
      humanMappingDecision: "equivalent_evidence_coverage",
      humanNotes: "",
      completed: true,
    }],
    coverage: [{
      configured: { anchorId: "configured:001" },
      humanDisposition: "mapped_to_legacy_evidence",
      humanNotes: "",
      completed: true,
    }],
    replacementRecommendation: "recommend_configured_replacement",
    replacementRationale: "Human parity review supports separate reviewed preparation.",
    semanticEquivalenceInferred: false,
    automaticMappingDecisionAuthorized: false,
    automaticReplacementDecisionAuthorized: false,
    legacyEntryPointMutationAuthorized: false,
    replacementAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
}

{
  assert.doesNotThrow(() => assertSanrioFoundationParityDecisionConformance(fixture()));
  console.log("edinet-sanrio-foundation-readiness-parity-decision: valid finalized decisions pass OK");
}

{
  const input = fixture();
  (input.mappings as JsonObject[])[0]!.humanMappingDecision = "invented_decision";
  assert.throws(
    () => assertSanrioFoundationParityDecisionConformance(input),
    /humanMappingDecision is invalid/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-decision: unknown mapping enum blocked OK");
}

{
  const input = fixture();
  input.replacementRecommendation = "invented_recommendation";
  assert.throws(
    () => assertSanrioFoundationParityDecisionConformance(input),
    /replacementRecommendation is invalid/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-decision: unknown recommendation enum blocked OK");
}

{
  const input = fixture();
  input.materiallyInconsistentMappingCount = 1;
  assert.throws(
    () => assertSanrioFoundationParityDecisionConformance(input),
    /materiallyInconsistentMappingCount mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-decision: forged aggregate count blocked OK");
}

{
  const input = fixture();
  const mapping = (input.mappings as JsonObject[])[0]!;
  mapping.humanMappingDecision = "materially_inconsistent";
  mapping.humanNotes = "Human found a material contradiction.";
  input.materiallyInconsistentMappingCount = 1;
  assert.throws(
    () => assertSanrioFoundationParityDecisionConformance(input),
    /cannot recommend configured replacement while blockers or insufficient evidence remain/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-decision: replacement recommendation cannot override blocking decision OK");
}

{
  const input = fixture();
  (input.coverage as JsonObject[])[0]!.humanDisposition = "additional_coverage_acceptable";
  assert.throws(
    () => assertSanrioFoundationParityDecisionConformance(input),
    /selected by mapping must be mapped_to_legacy_evidence/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-decision: selected mapping/coverage consistency enforced OK");
}

{
  const input = fixture();
  input.replacementRationale = "";
  assert.throws(
    () => assertSanrioFoundationParityDecisionConformance(input),
    /replacementRationale must be a non-empty string/,
  );
  console.log("edinet-sanrio-foundation-readiness-parity-decision: replacement rationale remains mandatory OK");
}

console.log("edinet-sanrio-foundation-readiness-parity-decision.test.ts passed");
