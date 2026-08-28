import { discoverResearchOrphans } from "../research-orphan-discovery.js";
import { buildResearchOrphanReviewManifest } from "../research-orphan-review-manifest.js";
import {
  buildResearchOrphanTriageView,
  readResearchOrphanTriageLedger,
} from "../research-orphan-triage.js";
import { fail, parseArgs } from "./common.js";

function parseReviewLimit(raw: string | undefined): number {
  if (raw === undefined) return 10;
  if (!/^[1-9]\d*$/.test(raw)) fail("--limit must be a positive integer");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 100) fail("--limit must be between 1 and 100");
  return value;
}

const { flags, options } = parseArgs();
const discovery = discoverResearchOrphans();
const ledger = readResearchOrphanTriageLedger();
const triage = buildResearchOrphanTriageView(discovery, ledger);
const manifest = buildResearchOrphanReviewManifest(triage);

if (flags.has("json")) {
  console.log(JSON.stringify(manifest, null, 2));
  if (manifest.issues.length > 0) process.exitCode = 1;
} else {
  console.log("Research Orphan Discovery v1 + Triage Memory v1 + Human Review Manifest v1 (warning-only)");
  console.log(
    `  scanned documents: ${discovery.stats.scannedDocumentCount}`
    + ` / raw candidates: ${triage.stats.rawCandidateCount}`
    + ` / review queue: ${manifest.stats.reviewQueueCount}`
    + ` (unreviewed=${triage.stats.unreviewedCount}, stale=${triage.stats.staleReviewCount})`
    + ` / actionable reviewed: ${manifest.stats.actionableReviewedCount}`
    + ` / acknowledged: ${triage.stats.acknowledgedCount}`
    + ` / historical-only decisions: ${triage.stats.historicalOnlyDecisionCount}`,
  );

  if (manifest.issues.length > 0) {
    console.error(`  scanner/authority/triage errors: ${manifest.issues.length}`);
    for (const entry of manifest.issues) {
      console.error(`  [ERROR] ${entry.code} ${entry.target}: ${entry.message}`);
    }
    console.error("Orphan review manifest failed closed because discovery or the append-only review memory was incomplete.");
    process.exitCode = 1;
  } else {
    const limit = parseReviewLimit(options.get("limit"));
    const visibleReview = manifest.entries.slice(0, limit);
    for (const entry of visibleReview) {
      const identity = entry.assetId ? ` asset=${entry.assetId}` : "";
      const suggestion = entry.suggestedClassification ?? "human_review_required";
      console.log(`  [REVIEW P${entry.reviewPriority}] ${entry.reviewBucket} ${entry.title}`);
      console.log(`    ${entry.path}${identity}`);
      console.log(`    key=${entry.candidateKey}`);
      console.log(`    fingerprint=${entry.candidateFingerprint}`);
      console.log(`    why=${entry.whyDiscovered}`);
      console.log(`    suggestedClassification=${suggestion}`);
      console.log("    existingRelatedResearchCandidates=not_evaluated_v1 / possibleDuplicate=not_evaluated_v1");
      if (entry.previousHumanDecision) {
        console.log(
          `    previousHumanDecision=${entry.previousHumanDecision.classification}`
          + ` @ ${entry.previousHumanDecision.reviewedAt}`,
        );
      }
      console.log(`    next=${entry.suggestedNextAction}`);
    }
    if (manifest.entries.length > visibleReview.length) {
      console.log(`  ... ${manifest.entries.length - visibleReview.length} more human-review candidates omitted; use --limit=100 or --json`);
    }

    const visibleActionable = manifest.actionableReviewed.slice(0, limit);
    for (const entry of visibleActionable) {
      const identity = entry.assetId ? ` asset=${entry.assetId}` : "";
      console.log(`  [ACTIONABLE] ${entry.classification} ${entry.path}${identity}`);
      console.log(`    humanDecision=${entry.decisionId} @ ${entry.reviewedAt}`);
      console.log(`    reminder=${entry.resolutionReminder}`);
    }
    if (manifest.actionableReviewed.length > visibleActionable.length) {
      console.log(`  ... ${manifest.actionableReviewed.length - visibleActionable.length} more reviewed-but-unresolved candidates omitted`);
    }

    console.log("  Review Manifest is derived/read-only. It never appends canonical decisions, creates Research entities, resolves duplicates, promotes Edges, or changes BUY/SELL/Learning rules.");
  }
}
