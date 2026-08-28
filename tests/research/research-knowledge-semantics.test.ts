import assert from "node:assert/strict";
import {
  validateResearchKnowledgeSemantics,
  type ResearchKnowledgeSnapshot,
} from "../../src/research/research-knowledge-semantics.js";

const ontologyVersion = "research-knowledge-v1" as const;
const t = {
  created: "2026-08-28T10:00:00+09:00",
  registered: "2026-08-28T10:10:00+09:00",
  selection: "2026-08-28T10:15:00+09:00",
  manifest: "2026-08-28T10:20:00+09:00",
  result: "2026-08-28T10:30:00+09:00",
  detected: "2026-08-28T10:40:00+09:00",
  cutoff: "2026-08-28T10:39:00+09:00",
};

function validSnapshot(): ResearchKnowledgeSnapshot {
  return {
    researchItems: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "research-kioxia-rerating",
      title: "Kioxia rerating investigation",
      status: "investigating",
      createdAt: t.created,
      origin: "user",
      summary: "Separate structural, cycle and supply-demand explanations before formal Edge creation.",
    }],
    researchQuestions: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "question-kioxia-cause",
      question: "Which causal mechanisms explain the post-IPO rerating?",
      status: "open",
      createdAt: t.created,
    }],
    observations: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "observation-kioxia-rerating",
      title: "Kioxia rerated after IPO",
      observedAt: t.created,
      origin: "user",
      summary: "Observed behavior without causal attribution.",
    }],
    mechanisms: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "mechanism-structural-discount-removal",
      title: "Structural discount removal",
      description: "Ownership and listing structure changes can remove a persistent valuation discount.",
      status: "active",
      createdAt: t.created,
    }],
    researchFamilies: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "family-corporate-structure-rerating",
      title: "Corporate structure rerating",
      description: "Causal family organized around structural valuation discount changes.",
      status: "active",
      createdAt: t.created,
    }],
    researchComponents: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "component-formal-event-repricing",
      title: "Formal event repricing",
      kind: "phase",
      status: "active",
      createdAt: t.created,
      description: "A phase inside a broader repricing Edge.",
    }],
    cases: [
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "case-kioxia-ipo-rerating",
        title: "Kioxia IPO/post-IPO rerating episode",
        status: "open",
        createdAt: t.created,
        summary: "Bounded market episode linked to issuer and event authorities.",
        episodeStart: "2026-08-01T09:00:00+09:00",
        episodeEnd: "2026-08-28T09:00:00+09:00",
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "case-external-venue-crime",
        title: "External venue-only negative control",
        status: "closed",
        createdAt: t.created,
        summary: "Negative-control Case outside internal misconduct population.",
      },
    ],
    studies: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "study-kioxia-mechanism-separation",
      title: "Kioxia mechanism separation study",
      mode: "confirmatory",
      status: "registered",
      createdAt: t.created,
      registeredAt: t.registered,
      informationCutoff: t.created,
      purpose: "Test predeclared mechanism signatures without using later outcomes at registration.",
    }],
    sampleManifests: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "sample-kioxia-confirmatory-v1",
      studyId: "study-kioxia-mechanism-separation",
      role: "confirmatory",
      createdAt: t.manifest,
      selectionCutoff: t.selection,
      selectionMethod: "Apply the declared Case inclusion/exclusion policy at the selection cutoff.",
      includedCaseIds: ["case-kioxia-ipo-rerating"],
      excludedCases: [{
        caseId: "case-external-venue-crime",
        reason: "Outside the declared issuer/event population.",
      }],
    }],
    studyResults: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "result-kioxia-mechanism-separation-v1",
      studyId: "study-kioxia-mechanism-separation",
      sampleManifestId: "sample-kioxia-confirmatory-v1",
      createdAt: t.result,
      effectSummary: "Result remains suggestive and does not collapse competing explanations into one proven cause.",
      identificationQuality: "correlational",
      exploitability: "observed_effect_only",
      limitations: ["Small sample"],
      negativeFindings: ["insufficient_sample"],
    }],
    opportunities: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "opportunity-live-misconduct-instance",
      title: "Live formal Edge applicability candidate",
      status: "screening",
      detectedAt: t.detected,
      informationCutoff: t.cutoff,
      summary: "Applicability candidate only; not a Recommendation.",
    }],
    relations: [
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-observation-event",
        relationType: "observes_event",
        sourceType: "observation",
        sourceId: "observation-kioxia-rerating",
        targetType: "event",
        targetId: "event:kioxia_ipo",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-question-item",
        relationType: "addresses",
        sourceType: "research_question",
        sourceId: "question-kioxia-cause",
        targetType: "research_item",
        targetId: "research-kioxia-rerating",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-item-family",
        relationType: "member_of",
        sourceType: "research_item",
        sourceId: "research-kioxia-rerating",
        targetType: "research_family",
        targetId: "family-corporate-structure-rerating",
        role: "primary",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-component-edge",
        relationType: "part_of",
        sourceType: "research_component",
        sourceId: "component-formal-event-repricing",
        targetType: "edge",
        targetId: "misconduct-overreaction-recovery",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-item-mechanism",
        relationType: "considers_mechanism",
        sourceType: "research_item",
        sourceId: "research-kioxia-rerating",
        targetType: "mechanism",
        targetId: "mechanism-structural-discount-removal",
        role: "candidate",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-study-question",
        relationType: "studies",
        sourceType: "study",
        sourceId: "study-kioxia-mechanism-separation",
        targetType: "research_question",
        targetId: "question-kioxia-cause",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-case-used-in-edge",
        relationType: "used_in",
        sourceType: "case",
        sourceId: "case-kioxia-ipo-rerating",
        targetType: "edge",
        targetId: "misconduct-overreaction-recovery",
        role: "supporting_sample",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-case-entity",
        relationType: "involves_entity",
        sourceType: "case",
        sourceId: "case-kioxia-ipo-rerating",
        targetType: "entity",
        targetId: "issuer:jp:kioxia_holdings",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-case-event-0",
        relationType: "includes_event",
        sourceType: "case",
        sourceId: "case-kioxia-ipo-rerating",
        targetType: "event",
        targetId: "event:kioxia_ipo",
        order: 0,
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-case-event-1",
        relationType: "includes_event",
        sourceType: "case",
        sourceId: "case-kioxia-ipo-rerating",
        targetType: "event",
        targetId: "event:kioxia_lockup_change",
        order: 1,
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-opportunity-edge",
        relationType: "applies_edge",
        sourceType: "opportunity",
        sourceId: "opportunity-live-misconduct-instance",
        targetType: "edge",
        targetId: "misconduct-overreaction-recovery",
        createdAt: t.detected,
        informationCutoff: t.cutoff,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-opportunity-event",
        relationType: "triggered_by",
        sourceType: "opportunity",
        sourceId: "opportunity-live-misconduct-instance",
        targetType: "event",
        targetId: "event:kioxia_lockup_change",
        createdAt: t.detected,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-watch-edge",
        relationType: "operationalizes",
        sourceType: "watch",
        sourceId: "watch:special_situation",
        targetType: "edge",
        targetId: "misconduct-overreaction-recovery",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-implementation-watch",
        relationType: "implements",
        sourceType: "implementation",
        sourceId: "src/special-situation-watch-report.ts",
        targetType: "watch",
        targetId: "watch:special_situation",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-document-item",
        relationType: "documents",
        sourceType: "document",
        sourceId: "docs/research/example.md",
        targetType: "research_item",
        targetId: "research-kioxia-rerating",
        role: "supporting_note",
        createdAt: t.created,
      },
      {
        schemaVersion: 1,
        ontologyVersion,
        id: "relation-item-depends-mechanism",
        relationType: "depends_on",
        sourceType: "research_item",
        sourceId: "research-kioxia-rerating",
        targetType: "mechanism",
        targetId: "mechanism-structural-discount-removal",
        createdAt: t.created,
      },
    ],
    lineages: [{
      schemaVersion: 1,
      ontologyVersion,
      id: "lineage-known-bad-to-misconduct",
      lineageType: "merged_into",
      sourceType: "edge",
      sourceId: "known-bad-event-repricing",
      targetType: "edge",
      targetId: "misconduct-overreaction-recovery",
      decidedAt: t.created,
      reason: "Same causal signature; formal-event repricing is preserved as a phase rather than duplicate active Edge.",
    }],
    externalReferences: {
      edgeIds: ["known-bad-event-repricing", "misconduct-overreaction-recovery"],
      eventIds: ["event:kioxia_ipo", "event:kioxia_lockup_change"],
      entityIds: ["issuer:jp:kioxia_holdings"],
      documentIds: ["docs/research/example.md"],
      watchIds: ["watch:special_situation"],
      implementationIds: ["src/special-situation-watch-report.ts"],
    },
  };
}

function codes(snapshot: ResearchKnowledgeSnapshot): Set<string> {
  return new Set(validateResearchKnowledgeSemantics(snapshot).map((item) => item.code));
}

function requireCode(snapshot: ResearchKnowledgeSnapshot, code: string): void {
  const issues = validateResearchKnowledgeSemantics(snapshot);
  assert.ok(issues.some((item) => item.code === code), `${code} not found: ${JSON.stringify(issues)}`);
}

{
  const snapshot = validSnapshot();
  assert.deepEqual(validateResearchKnowledgeSemantics(snapshot), []);
}

{
  const snapshot = validSnapshot();
  snapshot.relations = [
    ...snapshot.relations,
    {
      ...snapshot.relations[1]!,
      id: "relation-question-item-duplicate",
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-bad-endpoint",
      relationType: "observes_event",
      sourceType: "research_item",
      sourceId: "research-kioxia-rerating",
      targetType: "event",
      targetId: "event:missing",
      createdAt: t.created,
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-self-dependency",
      relationType: "depends_on",
      sourceType: "research_item",
      sourceId: "research-kioxia-rerating",
      targetType: "research_item",
      targetId: "research-kioxia-rerating",
      createdAt: t.created,
    },
  ];
  const found = codes(snapshot);
  assert.ok(found.has("research_relation_semantic_duplicate"));
  assert.ok(found.has("research_relation_endpoint_type_mismatch"));
  assert.ok(found.has("research_relation_dangling_target"));
  assert.ok(found.has("research_relation_self_reference"));
  assert.ok(found.has("research_dependency_cycle"));
}

{
  const snapshot = validSnapshot();
  snapshot.relations = snapshot.relations.map((relation) =>
    relation.id === "relation-case-event-1" ? { ...relation, order: 3 } : relation,
  );
  requireCode(snapshot, "research_event_chain_non_contiguous_order");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = snapshot.relations.map((relation) =>
    relation.id === "relation-case-event-1" ? { ...relation, order: 0 } : relation,
  );
  requireCode(snapshot, "research_event_chain_duplicate_order");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = snapshot.relations.filter((relation) => relation.id !== "relation-component-edge");
  requireCode(snapshot, "research_component_parent_cardinality");
}

{
  const snapshot = validSnapshot();
  snapshot.researchFamilies = [
    ...snapshot.researchFamilies,
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "family-second-primary",
      title: "Second primary",
      description: "Used only to prove cardinality guard.",
      status: "active",
      createdAt: t.created,
    },
  ];
  snapshot.relations = [
    ...snapshot.relations,
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-second-primary-family",
      relationType: "member_of",
      sourceType: "research_item",
      sourceId: "research-kioxia-rerating",
      targetType: "research_family",
      targetId: "family-second-primary",
      role: "primary",
      createdAt: t.created,
    },
  ];
  requireCode(snapshot, "research_multiple_primary_families");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = snapshot.relations.filter((relation) => relation.relationType !== "addresses");
  requireCode(snapshot, "research_question_without_parent_item");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = snapshot.relations.filter((relation) => relation.relationType !== "studies");
  requireCode(snapshot, "research_study_without_target");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = snapshot.relations.filter((relation) => relation.relationType !== "applies_edge");
  requireCode(snapshot, "research_opportunity_without_edge");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = [
    ...snapshot.relations,
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-mechanism-back-to-item",
      relationType: "depends_on",
      sourceType: "mechanism",
      sourceId: "mechanism-structural-discount-removal",
      targetType: "research_item",
      targetId: "research-kioxia-rerating",
      createdAt: t.created,
    },
  ];
  requireCode(snapshot, "research_dependency_cycle");
}

{
  const snapshot = validSnapshot();
  snapshot.lineages = [
    ...snapshot.lineages,
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "lineage-misconduct-back-to-known-bad",
      lineageType: "derived_from",
      sourceType: "edge",
      sourceId: "misconduct-overreaction-recovery",
      targetType: "edge",
      targetId: "known-bad-event-repricing",
      decidedAt: t.result,
      reason: "Invalid reverse lineage used to prove cycle detection.",
    },
  ];
  requireCode(snapshot, "research_lineage_cycle");
}

{
  const snapshot = validSnapshot();
  snapshot.externalReferences = {
    ...snapshot.externalReferences,
    edgeIds: [
      ...(snapshot.externalReferences?.edgeIds ?? []),
      "third-edge",
    ],
  };
  snapshot.lineages = [
    ...snapshot.lineages,
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "lineage-known-bad-second-merge",
      lineageType: "merged_into",
      sourceType: "edge",
      sourceId: "known-bad-event-repricing",
      targetType: "edge",
      targetId: "third-edge",
      decidedAt: t.result,
      reason: "Invalid second merge destination.",
    },
  ];
  requireCode(snapshot, "research_multiple_merge_destinations");
}

{
  const snapshot = validSnapshot();
  snapshot.lineages = [
    ...snapshot.lineages,
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "lineage-bad-cross-type-merge",
      lineageType: "merged_into",
      sourceType: "research_item",
      sourceId: "research-kioxia-rerating",
      targetType: "research_question",
      targetId: "question-kioxia-cause",
      decidedAt: t.result,
      reason: "Invalid cross-type merge.",
    },
  ];
  requireCode(snapshot, "research_lineage_type_mismatch");
}

{
  const snapshot = validSnapshot();
  snapshot.researchItems = snapshot.researchItems.map((item) => ({
    ...item,
    status: "resolved",
  }));
  requireCode(snapshot, "research_item_resolved_without_resolution");
}

{
  const snapshot = validSnapshot();
  snapshot.researchItems = snapshot.researchItems.map((item) => ({
    ...item,
    resolution: "new_edge_candidate",
  }));
  requireCode(snapshot, "research_item_active_with_final_disposition");
}

{
  const snapshot = validSnapshot();
  snapshot.cases = snapshot.cases.map((record) =>
    record.id === "case-kioxia-ipo-rerating"
      ? { ...record, episodeEnd: "2026-07-01T09:00:00+09:00" }
      : record,
  );
  requireCode(snapshot, "research_case_episode_reversed");
}

{
  const snapshot = validSnapshot();
  snapshot.studies = snapshot.studies.map((study) => ({
    ...study,
    registeredAt: undefined,
  }));
  requireCode(snapshot, "research_study_registered_status_without_timestamp");
}

{
  const snapshot = validSnapshot();
  snapshot.studies = snapshot.studies.map((study) => ({
    ...study,
    informationCutoff: "2026-08-28T10:11:00+09:00",
  }));
  requireCode(snapshot, "research_study_future_information_at_registration");
}

{
  const snapshot = validSnapshot();
  snapshot.sampleManifests = snapshot.sampleManifests.map((manifest) => ({
    ...manifest,
    role: "exploratory",
    includedCaseIds: ["case-kioxia-ipo-rerating", "case-external-venue-crime"],
  }));
  const found = codes(snapshot);
  assert.ok(found.has("research_sample_manifest_role_mismatch"));
  assert.ok(found.has("research_sample_manifest_case_overlap"));
}

{
  const snapshot = validSnapshot();
  snapshot.studyResults = snapshot.studyResults.map((result) => ({
    ...result,
    studyId: "study-missing",
  }));
  const found = codes(snapshot);
  assert.ok(found.has("research_study_result_unknown_study"));
  assert.ok(found.has("research_study_result_manifest_study_mismatch"));
}

{
  const snapshot = validSnapshot();
  snapshot.opportunities = snapshot.opportunities.map((opportunity) => ({
    ...opportunity,
    informationCutoff: "2026-08-28T10:41:00+09:00",
  }));
  requireCode(snapshot, "research_opportunity_future_information_cutoff");
}

{
  const snapshot = validSnapshot();
  snapshot.relations = [
    ...snapshot.relations,
    {
      ...snapshot.relations[0]!,
      id: "research-kioxia-rerating",
    },
  ];
  requireCode(snapshot, "research_knowledge_duplicate_owned_id");
}

console.log("research knowledge semantics: all tests passed");
