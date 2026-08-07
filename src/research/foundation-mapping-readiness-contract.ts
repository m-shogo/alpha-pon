import type { ReviewedEdinetFoundationInput } from "./edinet-reviewed-foundation-preview.js";

type RootKey = keyof ReviewedEdinetFoundationInput;
type SectionKey = keyof ReviewedEdinetFoundationInput["sections"][number];
type PriorKey = keyof NonNullable<ReviewedEdinetFoundationInput["prior"]>;

export const FOUNDATION_INPUT_SYSTEM_FIXED_ROOT_KEYS = [
  "schemaVersion",
  "reviewedByHuman",
  "semanticMappingStatus",
] as const satisfies readonly RootKey[];

export const FOUNDATION_INPUT_REVIEW_CONTEXT_ROOT_KEYS = [
  "reviewId",
  "reviewedBy",
  "reviewedAt",
] as const satisfies readonly RootKey[];

export const FOUNDATION_INPUT_LINEAGE_ROOT_KEYS = [
  "docID",
] as const satisfies readonly RootKey[];

export type FoundationMappingRemediationGroupId =
  | "security_master"
  | "document_metadata"
  | "pit_timestamps"
  | "retrieval_and_normalization"
  | "revision_chain"
  | "rights_and_storage"
  | "section_mapping";

export type FoundationMappingRemediationDefinition = {
  groupId: FoundationMappingRemediationGroupId;
  order: number;
  action: string;
  dependsOnGroupIds: FoundationMappingRemediationGroupId[];
  rootKeys: readonly RootKey[];
  fieldPaths: readonly string[];
};

export const FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS = [
  {
    groupId: "security_master",
    order: 10,
    action: "resolve_governed_security_master_identity",
    dependsOnGroupIds: [],
    rootKeys: ["entityIds"],
    fieldPaths: ["entityIds"],
  },
  {
    groupId: "document_metadata",
    order: 20,
    action: "collect_document_level_metadata_and_content_hash",
    dependsOnGroupIds: ["security_master"],
    rootKeys: ["chainRootDocID", "documentTypeCode", "sourceContentHash", "title", "summary", "language"],
    fieldPaths: ["chainRootDocID", "documentTypeCode", "sourceContentHash", "title", "summary", "language"],
  },
  {
    groupId: "pit_timestamps",
    order: 30,
    action: "establish_complete_point_in_time_clock_lineage",
    dependsOnGroupIds: ["document_metadata"],
    rootKeys: [
      "publishedAt",
      "observedAt",
      "retrievedAt",
      "effectiveFrom",
      "firstExecutableAt",
      "eventAtStatus",
      "eventAt",
    ],
    fieldPaths: [
      "publishedAt",
      "observedAt",
      "retrievedAt",
      "effectiveFrom",
      "firstExecutableAt",
      "eventAtStatus",
      "eventAt",
    ],
  },
  {
    groupId: "retrieval_and_normalization",
    order: 40,
    action: "pin_retrieval_parser_and_normalization_lineage",
    dependsOnGroupIds: ["document_metadata"],
    rootKeys: ["retrievalRunId", "parserVersion", "normalizationVersion", "normalizedStructureHash"],
    fieldPaths: ["retrievalRunId", "parserVersion", "normalizationVersion", "normalizedStructureHash"],
  },
  {
    groupId: "revision_chain",
    order: 50,
    action: "establish_governed_revision_and_prior_relations",
    dependsOnGroupIds: ["document_metadata", "pit_timestamps"],
    rootKeys: ["revisionKind", "revisionSequence", "evidenceStatus", "documentRevisionStatus", "prior"],
    fieldPaths: [
      "revisionKind",
      "revisionSequence",
      "evidenceStatus",
      "documentRevisionStatus",
      "prior",
      "prior.evidenceId",
      "prior.documentRevisionId",
      "prior.documentRevisionRecordId",
      "prior.relationType",
      "prior.supersessionStrength",
    ],
  },
  {
    groupId: "rights_and_storage",
    order: 60,
    action: "record_explicit_license_and_storage_policy",
    dependsOnGroupIds: ["document_metadata"],
    rootKeys: ["license", "storagePolicy"],
    fieldPaths: ["license", "storagePolicy"],
  },
  {
    groupId: "section_mapping",
    order: 70,
    action: "build_complete_section_mapping_and_hashes",
    dependsOnGroupIds: ["document_metadata", "retrieval_and_normalization"],
    rootKeys: ["sections"],
    fieldPaths: [
      "sections[].sectionId",
      "sections[].path",
      "sections[].ordinal",
      "sections[].titleHash",
      "sections[].contentHash",
    ],
  },
] as const satisfies readonly FoundationMappingRemediationDefinition[];

export const FOUNDATION_INPUT_SECTION_KEYS = [
  "sectionId",
  "path",
  "ordinal",
  "titleHash",
  "contentHash",
] as const satisfies readonly SectionKey[];

export const FOUNDATION_INPUT_PRIOR_KEYS = [
  "evidenceId",
  "documentRevisionId",
  "documentRevisionRecordId",
  "relationType",
  "supersessionStrength",
] as const satisfies readonly PriorKey[];

type RemediationRootKey = typeof FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS[number]["rootKeys"][number];
type AccountedRootKey =
  | typeof FOUNDATION_INPUT_SYSTEM_FIXED_ROOT_KEYS[number]
  | typeof FOUNDATION_INPUT_REVIEW_CONTEXT_ROOT_KEYS[number]
  | typeof FOUNDATION_INPUT_LINEAGE_ROOT_KEYS[number]
  | RemediationRootKey;

type MissingRootKey = Exclude<RootKey, AccountedRootKey>;
type UnknownRootKey = Exclude<AccountedRootKey, RootKey>;
type MissingSectionKey = Exclude<SectionKey, typeof FOUNDATION_INPUT_SECTION_KEYS[number]>;
type UnknownSectionKey = Exclude<typeof FOUNDATION_INPUT_SECTION_KEYS[number], SectionKey>;
type MissingPriorKey = Exclude<PriorKey, typeof FOUNDATION_INPUT_PRIOR_KEYS[number]>;
type UnknownPriorKey = Exclude<typeof FOUNDATION_INPUT_PRIOR_KEYS[number], PriorKey>;

type ExactCoverage<Missing, Unknown> = [Missing, Unknown] extends [never, never] ? true : never;

export const FOUNDATION_INPUT_ROOT_CONTRACT_EXHAUSTIVE: ExactCoverage<MissingRootKey, UnknownRootKey> = true;
export const FOUNDATION_INPUT_SECTION_CONTRACT_EXHAUSTIVE: ExactCoverage<MissingSectionKey, UnknownSectionKey> = true;
export const FOUNDATION_INPUT_PRIOR_CONTRACT_EXHAUSTIVE: ExactCoverage<MissingPriorKey, UnknownPriorKey> = true;

const DEFINITION_BY_ID = new Map<string, FoundationMappingRemediationDefinition>(
  FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS.map(definition => [definition.groupId, definition]),
);

export function foundationMappingRemediationDefinition(
  groupId: string,
): FoundationMappingRemediationDefinition | null {
  return DEFINITION_BY_ID.get(groupId) ?? null;
}

export function foundationMappingRequiredFieldPaths(): string[] {
  return [...new Set(FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS.flatMap(definition => definition.fieldPaths))].sort();
}
