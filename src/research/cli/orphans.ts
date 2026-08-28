import { discoverResearchOrphans } from "../research-orphan-discovery.js";
import {
  buildResearchOrphanTriageView,
  readResearchOrphanTriageLedger,
} from "../research-orphan-triage.js";

const discovery = discoverResearchOrphans();
const ledger = readResearchOrphanTriageLedger();
const triage = buildResearchOrphanTriageView(discovery, ledger);

console.log("Research Orphan Discovery v1 + Triage Memory v1 (warning-only)");
console.log(
  `  scanned documents: ${discovery.stats.scannedDocumentCount}`
  + ` / raw candidates: ${triage.stats.rawCandidateCount}`
  + ` / review queue: ${triage.stats.unreviewedCount + triage.stats.staleReviewCount}`
  + ` (unreviewed=${triage.stats.unreviewedCount}, stale=${triage.stats.staleReviewCount})`
  + ` / actionable: ${triage.stats.actionableCount}`
  + ` / acknowledged: ${triage.stats.acknowledgedCount}`
  + ` / historical-only decisions: ${triage.stats.historicalOnlyDecisionCount}`,
);

if (triage.issues.length > 0) {
  console.error(`  scanner/authority/triage errors: ${triage.issues.length}`);
  for (const entry of triage.issues) {
    console.error(`  [ERROR] ${entry.code} ${entry.target}: ${entry.message}`);
  }
  console.error("Orphan triage failed closed because discovery or the append-only review memory was incomplete.");
  process.exitCode = 1;
} else {
  const displayLimit = 100;
  const visible = [...triage.reviewQueue, ...triage.actionable]
    .sort((left, right) => left.candidate.key.localeCompare(right.candidate.key));
  for (const entry of visible.slice(0, displayLimit)) {
    const identity = entry.candidate.assetId ? ` asset=${entry.candidate.assetId}` : "";
    const classification = entry.decision?.classification ?? entry.candidate.classification;
    console.log(
      `  [WARN] ${entry.triageState} ${classification} ${entry.candidate.assetType} ${entry.candidate.path}${identity}`,
    );
  }
  if (visible.length > displayLimit) {
    console.log(`  ... ${visible.length - displayLimit} more review/action candidates omitted from console output`);
  }
  console.log("  Human triage memory never creates Asset, ResearchItem, Study, Edge, Relation, BUY/SELL rule, or generated authority; actionable classifications remain visible until the underlying orphan is actually resolved.");
}
