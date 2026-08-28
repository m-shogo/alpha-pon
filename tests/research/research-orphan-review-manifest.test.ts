import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ResearchOrphanCandidate,
  ResearchOrphanDiscoveryResult,
} from "../../src/research/research-orphan-discovery.js";
import { buildResearchOrphanReviewManifest } from "../../src/research/research-orphan-review-manifest.js";
import {
  buildResearchOrphanTriageView,
  type ResearchOrphanTriageDecision,
  type ResearchOrphanTriageLedgerResult,
} from "../../src/research/research-orphan-triage.js";

const FP_CURRENT = "a".repeat(64);
const FP_PREVIOUS = "b".repeat(64);

function candidate(
  key: string,
  path: string,
  options: Partial<ResearchOrphanCandidate> = {},
): ResearchOrphanCandidate {
  return {
    key,
    fingerprint: FP_CURRENT,
    kind: "unregistered_asset",
    discoveryStage: "structured_scan",
    classification: "unclassified",
    assetType: "document",
    path,
    reason: "discovered by deterministic research orphan scan",
    ...options,
  };
}

function decision(
  decisionId: string,
  candidateKey: string,
  classification: ResearchOrphanTriageDecision["classification"],
  candidateFingerprint: string,
  reviewedAt: string,
): ResearchOrphanTriageDecision {
  return {
    schemaVersion: 1,
    decisionId,
    candidateKey,
    candidateFingerprint,
    classification,
    decisionSource: "human_review",
    reviewedAt,
    rationale: "deliberate human review",
  };
}

function discovery(candidates: readonly ResearchOrphanCandidate[]): ResearchOrphanDiscoveryResult {
  return {
    candidates,
    scannedDocumentPaths: candidates.map((entry) => entry.path),
    issues: [],
    stats: {
      scannedDocumentCount: candidates.length,
      unregisteredDocumentCount: candidates.filter((entry) => entry.kind === "unregistered_asset").length,
      unlinkedProvenAssetCount: candidates.filter((entry) => entry.kind === "registered_asset_without_relation").length,
      totalCandidates: candidates.length,
    },
  };
}

const root = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-review-manifest-"));
try {
  const staleKey = "unregistered_asset:document:docs/research/stale.md";
  const linkKey = "registered_asset_without_relation:document:doc-link";
  const actionableKey = "unregistered_asset:document:docs/research/actionable.md";
  const candidates = [
    candidate(staleKey, "docs/research/stale.md"),
    candidate(linkKey, "docs/research/link.md", {
      kind: "registered_asset_without_relation",
      classification: "existing_research_link_missing",
      assetId: "doc-link",
    }),
    candidate(actionableKey, "docs/research/actionable.md"),
  ];

  for (const [path, title] of [
    ["docs/research/stale.md", "Stale Review"],
    ["docs/research/link.md", "Existing Link"],
    ["docs/research/actionable.md", "Actionable Research"],
  ] as const) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, `# ${title}\n\nbody\n`, "utf-8");
  }

  const staleDecision = decision(
    "decision-stale",
    staleKey,
    "not_research",
    FP_PREVIOUS,
    "2026-08-28T08:00:00Z",
  );
  const actionableDecision = decision(
    "decision-actionable",
    actionableKey,
    "research_item_candidate",
    FP_CURRENT,
    "2026-08-28T08:01:00Z",
  );
  const ledger: ResearchOrphanTriageLedgerResult = {
    records: [staleDecision, actionableDecision],
    latestByCandidateKey: {
      [staleKey]: staleDecision,
      [actionableKey]: actionableDecision,
    },
    issues: [],
  };

  const triage = buildResearchOrphanTriageView(discovery(candidates), ledger);
  const manifest = buildResearchOrphanReviewManifest(triage, root);

  assert.equal(manifest.authority, "derived_read_only");
  assert.equal(manifest.purpose, "human_orphan_triage");
  assert.equal(manifest.stats.reviewQueueCount, 2);
  assert.equal(manifest.stats.staleReviewCount, 1);
  assert.equal(manifest.stats.existingLinkGapCount, 1);
  assert.equal(manifest.stats.actionableReviewedCount, 1);

  const stale = manifest.entries[0];
  assert.equal(stale?.candidateKey, staleKey, "stale re-review must be first priority");
  assert.equal(stale?.reviewBucket, "stale_re_review");
  assert.equal(stale?.title, "Stale Review", "manifest exposes a human-readable source heading without changing fingerprint authority");
  assert.equal(stale?.suggestedClassification, null, "stale content must never inherit its prior classification as a new suggestion");
  assert.equal(stale?.previousHumanDecision?.classification, "not_research", "previous human memory stays visible for context");

  const link = manifest.entries[1];
  assert.equal(link?.reviewBucket, "existing_link_gap");
  assert.equal(link?.suggestedClassification, "existing_research_link_missing", "deterministic discovery may surface its existing link-gap classification as a suggestion");
  assert.deepEqual(link?.existingRelatedResearchCandidates, [], "v1 must not fabricate related research candidates");
  assert.equal(link?.possibleDuplicateCandidateKey, null, "v1 must not fabricate duplicate proposals");

  assert.equal(manifest.actionableReviewed[0]?.candidateKey, actionableKey);
  assert.equal(manifest.actionableReviewed[0]?.classification, "research_item_candidate");
  assert.match(manifest.actionableReviewed[0]?.resolutionReminder ?? "", /not resolution/i, "reviewed actionable orphan stays explicitly unresolved");

  const failed = buildResearchOrphanReviewManifest({
    ...triage,
    issues: [{
      severity: "error",
      code: "upstream_broken",
      target: "test",
      message: "fail closed",
    }],
  }, root);
  assert.deepEqual(failed.entries, [], "upstream integrity issues must fail the review manifest closed");
  assert.deepEqual(failed.actionableReviewed, [], "failed manifest must not leak partial actionable projections");

  console.log("research/orphan-review-manifest: derived human queue + actionable visibility OK");
} finally {
  rmSync(root, { recursive: true, force: true });
}
