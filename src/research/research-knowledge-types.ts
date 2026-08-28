export const RESEARCH_KNOWLEDGE_ONTOLOGY_VERSION = "research-knowledge-v1" as const;

export type ResearchKnowledgeOntologyVersion = typeof RESEARCH_KNOWLEDGE_ONTOLOGY_VERSION;
export type ResearchKnowledgeId = string;
export type ExternalAuthorityId = string;

export type ResearchOrigin =
  | "user"
  | "world_scan"
  | "company_watch"
  | "document_diff"
  | "agent_discovery"
  | "orphan_detection"
  | "outcome_learning"
  | "manual_research"
  | "external_news_discovery"
  | "migration";

export type ResearchItemStatus =
  | "captured"
  | "triage"
  | "investigating"
  | "synthesized"
  | "resolved"
  | "parked"
  | "archived";

export type ResearchItemResolution =
  | "existing_edge"
  | "component_candidate"
  | "new_edge_candidate"
  | "case_only"
  | "theme_context"
  | "infrastructure"
  | "not_repeatable"
  | "invalid_premise"
  | "insufficient_evidence"
  | "duplicate";

export type ResearchStopReason =
  | "resolved"
  | "duplicate"
  | "no_mechanism"
  | "insufficient_sample"
  | "data_unavailable"
  | "not_executable"
  | "false_premise"
  | "superseded"
  | "low_voi"
  | "parked";

export interface ResearchItemRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  aliases?: string[];
  status: ResearchItemStatus;
  createdAt: string;
  origin: ResearchOrigin;
  summary: string;
  resolution?: ResearchItemResolution;
  stopReason?: ResearchStopReason;
  lastReviewedAt?: string;
}

export interface ResearchObservationRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  observedAt: string;
  origin: ResearchOrigin;
  summary: string;
}

export type ResearchQuestionStatus =
  | "open"
  | "partially_answered"
  | "answered"
  | "blocked"
  | "obsolete";

export interface ResearchQuestionRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  question: string;
  status: ResearchQuestionStatus;
  createdAt: string;
  lastReviewedAt?: string;
}

export type ResearchMechanismStatus = "active" | "challenged" | "deprecated";

export interface ResearchMechanismRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  aliases?: string[];
  description: string;
  status: ResearchMechanismStatus;
  createdAt: string;
  lastReviewedAt?: string;
}

export type ResearchFamilyStatus = "active" | "deprecated";

export interface ResearchFamilyRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  aliases?: string[];
  description: string;
  status: ResearchFamilyStatus;
  createdAt: string;
}

export type ResearchComponentKind =
  | "phase"
  | "subsignal"
  | "filter"
  | "cohort"
  | "calibration"
  | "guard"
  | "fixture";

export type ResearchComponentStatus = "active" | "resolved" | "deprecated" | "archived";

export interface ResearchComponentRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  kind: ResearchComponentKind;
  status: ResearchComponentStatus;
  createdAt: string;
  description: string;
}

export type ResearchCaseStatus = "open" | "closed" | "archived";

export interface ResearchCaseRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  aliases?: string[];
  status: ResearchCaseStatus;
  createdAt: string;
  summary: string;
  episodeStart?: string;
  episodeEnd?: string;
}

export type ResearchStudyMode =
  | "exploratory"
  | "calibration"
  | "confirmatory"
  | "holdout"
  | "out_of_sample"
  | "revalidation";

export type ResearchStudyStatus =
  | "draft"
  | "registered"
  | "running"
  | "completed"
  | "cancelled"
  | "archived";

export interface ResearchStudyRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  mode: ResearchStudyMode;
  status: ResearchStudyStatus;
  createdAt: string;
  registeredAt?: string;
  informationCutoff?: string;
  purpose: string;
  population?: string;
  primaryMetric?: string;
  benchmarkSpec?: string;
  counterfactualPolicy?: string;
  confounderPolicy?: string;
  executionPolicy?: string;
}

export interface ResearchStudyExcludedCase {
  caseId: ResearchKnowledgeId;
  reason: string;
}

export interface ResearchStudySampleManifestRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  studyId: ResearchKnowledgeId;
  role: ResearchStudyMode;
  createdAt: string;
  selectionCutoff: string;
  selectionMethod: string;
  includedCaseIds: ResearchKnowledgeId[];
  excludedCases: ResearchStudyExcludedCase[];
}

export type ResearchIdentificationQuality =
  | "unidentified"
  | "descriptive"
  | "correlational"
  | "suggestive_causal"
  | "strong_causal";

export type ResearchExploitability =
  | "unknown"
  | "observed_effect_only"
  | "statistical_edge"
  | "economic_edge"
  | "executable_edge"
  | "not_executable";

export type ResearchNegativeFinding =
  | "wrong_mechanism"
  | "already_priced_in"
  | "no_effect"
  | "inverse_effect"
  | "confounded"
  | "not_executable"
  | "regime_dependent"
  | "data_artifact"
  | "false_analogy"
  | "selection_bias"
  | "insufficient_sample";

export interface ResearchStudyResultRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  studyId: ResearchKnowledgeId;
  sampleManifestId: ResearchKnowledgeId;
  createdAt: string;
  effectSummary: string;
  identificationQuality: ResearchIdentificationQuality;
  exploitability: ResearchExploitability;
  limitations: string[];
  negativeFindings?: ResearchNegativeFinding[];
}

export type ResearchOpportunityStatus =
  | "detected"
  | "screening"
  | "evidence_building"
  | "hypothesis_ready"
  | "decisioned"
  | "expired"
  | "invalidated";

export interface ResearchOpportunityRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  title: string;
  status: ResearchOpportunityStatus;
  detectedAt: string;
  informationCutoff?: string;
  summary: string;
}

export type ResearchRelationType =
  | "observes_event"
  | "includes_event"
  | "involves_entity"
  | "addresses"
  | "member_of"
  | "part_of"
  | "considers_mechanism"
  | "studies"
  | "used_in"
  | "documents"
  | "operationalizes"
  | "implements"
  | "applies_edge"
  | "triggered_by"
  | "depends_on";

export type ResearchRelationNodeType =
  | "research_item"
  | "research_question"
  | "observation"
  | "mechanism"
  | "research_family"
  | "research_component"
  | "case"
  | "study"
  | "study_result"
  | "opportunity"
  | "edge"
  | "event"
  | "entity"
  | "document"
  | "watch"
  | "implementation"
  | "outcome"
  | "claim"
  | "evidence";

export type ResearchRelationRole =
  | "seed"
  | "supporting_sample"
  | "negative_control"
  | "near_miss"
  | "contradictory"
  | "confounded"
  | "calibration"
  | "holdout"
  | "out_of_sample"
  | "candidate"
  | "primary"
  | "secondary"
  | "competing"
  | "weakened"
  | "rejected"
  | "design"
  | "supporting_note"
  | "guard"
  | "infrastructure";

export interface ResearchRelationRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  relationType: ResearchRelationType;
  sourceType: ResearchRelationNodeType;
  sourceId: ExternalAuthorityId;
  targetType: ResearchRelationNodeType;
  targetId: ExternalAuthorityId;
  role?: ResearchRelationRole;
  order?: number;
  createdAt: string;
  informationCutoff?: string;
  notes?: string;
}

export type ResearchLineageType =
  | "derived_from"
  | "merged_into"
  | "split_into"
  | "supersedes"
  | "reclassified_as";

export type ResearchLineageNodeType =
  | "research_item"
  | "research_question"
  | "mechanism"
  | "research_family"
  | "research_component"
  | "case"
  | "study"
  | "study_result"
  | "opportunity"
  | "edge";

export interface ResearchLineageRecord {
  schemaVersion: 1;
  ontologyVersion: ResearchKnowledgeOntologyVersion;
  id: ResearchKnowledgeId;
  lineageType: ResearchLineageType;
  sourceType: ResearchLineageNodeType;
  sourceId: ResearchKnowledgeId;
  targetType: ResearchLineageNodeType;
  targetId: ResearchKnowledgeId;
  decidedAt: string;
  reason: string;
  actor?: string;
}
