import { basename, join } from "node:path";
import { readReadOnlyTextFile } from "../read-only-text-file.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import type {
  ResearchOrphanTriageCandidateView,
  ResearchOrphanTriageClassification,
  ResearchOrphanTriageView,
} from "./research-orphan-triage.js";

export const RESEARCH_ORPHAN_REVIEW_MANIFEST_SCHEMA_VERSION = 1 as const;

export type ResearchOrphanReviewBucket =
  | "stale_re_review"
  | "existing_link_gap"
  | "unreviewed_discovery";

export interface ResearchOrphanReviewManifestEntry {
  candidateKey: string;
  candidateFingerprint: string;
  triageState: "unreviewed" | "review_stale";
  reviewBucket: ResearchOrphanReviewBucket;
  reviewPriority: number;
  kind: ResearchOrphanTriageCandidateView["candidate"]["kind"];
  assetType: ResearchOrphanTriageCandidateView["candidate"]["assetType"];
  path: string;
  assetId?: string;
  title: string;
  whyDiscovered: string;
  existingRelatedResearchCandidates: readonly string[];
  suggestedClassification: ResearchOrphanTriageClassification | null;
  possibleDuplicateCandidateKey: string | null;
  suggestedNextAction: string;
  previousHumanDecision?: {
    decisionId: string;
    classification: ResearchOrphanTriageClassification;
    reviewedAt: string;
    rationale: string;
  };
}

export interface ResearchOrphanActionableReviewEntry {
  candidateKey: string;
  candidateFingerprint: string;
  path: string;
  assetId?: string;
  classification: ResearchOrphanTriageClassification;
  decisionId: string;
  reviewedAt: string;
  rationale: string;
  resolutionReminder: string;
}

export interface ResearchOrphanReviewManifest {
  schemaVersion: typeof RESEARCH_ORPHAN_REVIEW_MANIFEST_SCHEMA_VERSION;
  authority: "derived_read_only";
  purpose: "human_orphan_triage";
  entries: readonly ResearchOrphanReviewManifestEntry[];
  actionableReviewed: readonly ResearchOrphanActionableReviewEntry[];
  issues: readonly ResearchKnowledgeIssue[];
  stats: {
    rawCandidateCount: number;
    reviewQueueCount: number;
    staleReviewCount: number;
    existingLinkGapCount: number;
    unreviewedDiscoveryCount: number;
    actionableReviewedCount: number;
    acknowledgedReviewedCount: number;
    historicalOnlyDecisionCount: number;
  };
}

function fallbackTitle(path: string): string {
  const name = basename(path).replace(/\.[^.]+$/, "");
  return name || path;
}

function readDocumentTitle(repositoryRootPath: string, path: string): string {
  const text = readReadOnlyTextFile(join(repositoryRootPath, path));
  if (!text) return fallbackTitle(path);
  const heading = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+\S/.test(line));
  return heading ? heading.replace(/^#{1,6}\s+/, "").trim() : fallbackTitle(path);
}

function bucketFor(entry: ResearchOrphanTriageCandidateView): {
  bucket: ResearchOrphanReviewBucket;
  priority: number;
} {
  if (entry.triageState === "review_stale") {
    return { bucket: "stale_re_review", priority: 1 };
  }
  if (entry.candidate.classification === "existing_research_link_missing") {
    return { bucket: "existing_link_gap", priority: 2 };
  }
  return { bucket: "unreviewed_discovery", priority: 3 };
}

function suggestedClassificationFor(
  entry: ResearchOrphanTriageCandidateView,
): ResearchOrphanTriageClassification | null {
  if (entry.triageState === "review_stale") return null;
  if (entry.candidate.classification === "existing_research_link_missing") {
    return "existing_research_link_missing";
  }
  return null;
}

function suggestedNextActionFor(entry: ResearchOrphanTriageCandidateView): string {
  if (entry.triageState === "review_stale") {
    return "Re-review the changed candidate from source content/context; do not automatically reuse the previous human decision.";
  }
  if (entry.candidate.classification === "existing_research_link_missing") {
    return "Confirm the intended existing Research identity/link. A triage classification alone does not resolve the orphan.";
  }
  return "Read the source and make a human triage decision. Do not auto-create ResearchItem, Study, Case, Component, Edge, or Relation.";
}

function toEntry(
  entry: ResearchOrphanTriageCandidateView,
  repositoryRootPath: string,
): ResearchOrphanReviewManifestEntry {
  const { bucket, priority } = bucketFor(entry);
  const previousHumanDecision = entry.decision
    ? {
        decisionId: entry.decision.decisionId,
        classification: entry.decision.classification,
        reviewedAt: entry.decision.reviewedAt,
        rationale: entry.decision.rationale,
      }
    : undefined;

  return {
    candidateKey: entry.candidate.key,
    candidateFingerprint: entry.candidate.fingerprint,
    triageState: entry.triageState === "review_stale" ? "review_stale" : "unreviewed",
    reviewBucket: bucket,
    reviewPriority: priority,
    kind: entry.candidate.kind,
    assetType: entry.candidate.assetType,
    path: entry.candidate.path,
    ...(entry.candidate.assetId ? { assetId: entry.candidate.assetId } : {}),
    title: readDocumentTitle(repositoryRootPath, entry.candidate.path),
    whyDiscovered: entry.candidate.reason,
    existingRelatedResearchCandidates: [],
    suggestedClassification: suggestedClassificationFor(entry),
    possibleDuplicateCandidateKey: null,
    suggestedNextAction: suggestedNextActionFor(entry),
    ...(previousHumanDecision ? { previousHumanDecision } : {}),
  };
}

function toActionableEntry(entry: ResearchOrphanTriageCandidateView): ResearchOrphanActionableReviewEntry {
  if (!entry.decision) {
    throw new Error(`actionable orphan ${entry.candidate.key} is missing its human decision`);
  }
  return {
    candidateKey: entry.candidate.key,
    candidateFingerprint: entry.candidate.fingerprint,
    path: entry.candidate.path,
    ...(entry.candidate.assetId ? { assetId: entry.candidate.assetId } : {}),
    classification: entry.decision.classification,
    decisionId: entry.decision.decisionId,
    reviewedAt: entry.decision.reviewedAt,
    rationale: entry.decision.rationale,
    resolutionReminder: "Human classification is memory, not resolution. Resolve the underlying Catalog/Relation/Research work explicitly.",
  };
}

export function buildResearchOrphanReviewManifest(
  triage: ResearchOrphanTriageView,
  repositoryRootPath = ".",
): ResearchOrphanReviewManifest {
  if (triage.issues.length > 0) {
    return {
      schemaVersion: RESEARCH_ORPHAN_REVIEW_MANIFEST_SCHEMA_VERSION,
      authority: "derived_read_only",
      purpose: "human_orphan_triage",
      entries: [],
      actionableReviewed: [],
      issues: triage.issues,
      stats: {
        rawCandidateCount: 0,
        reviewQueueCount: 0,
        staleReviewCount: 0,
        existingLinkGapCount: 0,
        unreviewedDiscoveryCount: 0,
        actionableReviewedCount: 0,
        acknowledgedReviewedCount: 0,
        historicalOnlyDecisionCount: 0,
      },
    };
  }

  const entries = triage.reviewQueue
    .map((entry) => toEntry(entry, repositoryRootPath))
    .sort((left, right) =>
      left.reviewPriority - right.reviewPriority
      || left.path.localeCompare(right.path)
      || left.candidateKey.localeCompare(right.candidateKey),
    );
  const actionableReviewed = triage.actionable
    .map(toActionableEntry)
    .sort((left, right) => left.path.localeCompare(right.path) || left.candidateKey.localeCompare(right.candidateKey));

  return {
    schemaVersion: RESEARCH_ORPHAN_REVIEW_MANIFEST_SCHEMA_VERSION,
    authority: "derived_read_only",
    purpose: "human_orphan_triage",
    entries,
    actionableReviewed,
    issues: [],
    stats: {
      rawCandidateCount: triage.stats.rawCandidateCount,
      reviewQueueCount: entries.length,
      staleReviewCount: entries.filter((entry) => entry.reviewBucket === "stale_re_review").length,
      existingLinkGapCount: entries.filter((entry) => entry.reviewBucket === "existing_link_gap").length,
      unreviewedDiscoveryCount: entries.filter((entry) => entry.reviewBucket === "unreviewed_discovery").length,
      actionableReviewedCount: actionableReviewed.length,
      acknowledgedReviewedCount: triage.stats.acknowledgedCount,
      historicalOnlyDecisionCount: triage.stats.historicalOnlyDecisionCount,
    },
  };
}
