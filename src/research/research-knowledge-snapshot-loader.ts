import { createHash } from "node:crypto";
import { stableStringify } from "./schema.js";
import {
  validateResearchKnowledgeIntegrity,
  type ResearchKnowledgeExternalAvailability,
  type ResearchKnowledgeExternalNodeType,
  type ResearchKnowledgeIntegrityOptions,
  type ResearchKnowledgeIntegritySnapshot,
} from "./research-knowledge-integrity.js";
import type {
  ResearchKnowledgeExternalReferences,
  ResearchKnowledgeIssue,
} from "./research-knowledge-semantics.js";
import type { ResearchKnowledgeAuthorityView } from "./research-knowledge-authority-adapters.js";

export type ResearchKnowledgeOwnedSnapshot = Omit<
  ResearchKnowledgeIntegritySnapshot,
  "externalReferences" | "externalAvailability"
>;

export type ResearchKnowledgeAuthorityViews = Partial<
  Record<ResearchKnowledgeExternalNodeType, ResearchKnowledgeAuthorityView>
>;

export interface ResearchKnowledgeSnapshotLoadOptions extends ResearchKnowledgeIntegrityOptions {
  /** Repository mode defaults to fail-closed external chronology. */
  requireExternalAvailability?: boolean;
}

export interface ResearchKnowledgeSnapshotLoadResult {
  snapshot: ResearchKnowledgeIntegritySnapshot;
  issues: readonly ResearchKnowledgeIssue[];
  fingerprint: string;
}

const EXTERNAL_REFERENCE_KEYS: Record<
  ResearchKnowledgeExternalNodeType,
  keyof ResearchKnowledgeExternalReferences
> = {
  edge: "edgeIds",
  event: "eventIds",
  entity: "entityIds",
  document: "documentIds",
  watch: "watchIds",
  implementation: "implementationIds",
};

const EXTERNAL_NODE_ORDER: readonly ResearchKnowledgeExternalNodeType[] = [
  "edge",
  "event",
  "entity",
  "document",
  "watch",
  "implementation",
];

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function sortById<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function canonicalOwnedSnapshot(snapshot: ResearchKnowledgeOwnedSnapshot): ResearchKnowledgeOwnedSnapshot {
  return {
    researchItems: sortById(snapshot.researchItems),
    researchQuestions: sortById(snapshot.researchQuestions),
    observations: sortById(snapshot.observations),
    mechanisms: sortById(snapshot.mechanisms),
    researchFamilies: sortById(snapshot.researchFamilies),
    researchComponents: sortById(snapshot.researchComponents),
    cases: sortById(snapshot.cases),
    studies: sortById(snapshot.studies),
    sampleManifests: sortById(snapshot.sampleManifests),
    studyResults: sortById(snapshot.studyResults),
    opportunities: sortById(snapshot.opportunities),
    relations: sortById(snapshot.relations),
    lineages: sortById(snapshot.lineages),
  };
}

function buildExternalProjection(
  views: ResearchKnowledgeAuthorityViews,
): {
  references: ResearchKnowledgeExternalReferences;
  availability: ResearchKnowledgeExternalAvailability;
  issues: ResearchKnowledgeIssue[];
} {
  const references: ResearchKnowledgeExternalReferences = {};
  const availability: ResearchKnowledgeExternalAvailability = {};
  const issues: ResearchKnowledgeIssue[] = [];

  for (const nodeType of EXTERNAL_NODE_ORDER) {
    const view = views[nodeType];
    if (!view) continue;
    if (view.nodeType !== nodeType) {
      issues.push(issue(
        "research_authority_view_type_mismatch",
        `authority_view:${nodeType}`,
        `authority slot ${nodeType} received view for ${view.nodeType}`,
      ));
      continue;
    }

    const referenceKey = EXTERNAL_REFERENCE_KEYS[nodeType];
    references[referenceKey] = [...view.ids].sort();
    availability[nodeType] = Object.fromEntries(
      Object.entries(view.availability).sort(([left], [right]) => left.localeCompare(right)),
    );
    issues.push(...view.issues);
  }

  return { references, availability, issues };
}

function fingerprintSnapshot(snapshot: ResearchKnowledgeIntegritySnapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

function sortIssues(issues: readonly ResearchKnowledgeIssue[]): ResearchKnowledgeIssue[] {
  return [...issues].sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function emptyResearchKnowledgeOwnedSnapshot(): ResearchKnowledgeOwnedSnapshot {
  return {
    researchItems: [],
    researchQuestions: [],
    observations: [],
    mechanisms: [],
    researchFamilies: [],
    researchComponents: [],
    cases: [],
    studies: [],
    sampleManifests: [],
    studyResults: [],
    opportunities: [],
    relations: [],
    lineages: [],
  };
}

export function loadResearchKnowledgeIntegritySnapshot(
  ownedInput: ResearchKnowledgeOwnedSnapshot,
  authorityViews: ResearchKnowledgeAuthorityViews = {},
  options: ResearchKnowledgeSnapshotLoadOptions = {},
): ResearchKnowledgeSnapshotLoadResult {
  const owned = canonicalOwnedSnapshot(ownedInput);
  const external = buildExternalProjection(authorityViews);
  const snapshot: ResearchKnowledgeIntegritySnapshot = {
    ...owned,
    externalReferences: external.references,
    externalAvailability: external.availability,
  };
  const integrityIssues = validateResearchKnowledgeIntegrity(snapshot, {
    requireExternalAvailability: options.requireExternalAvailability ?? true,
  });
  return {
    snapshot,
    issues: sortIssues([...external.issues, ...integrityIssues]),
    fingerprint: fingerprintSnapshot(snapshot),
  };
}
