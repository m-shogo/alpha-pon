import { discoverResearchOrphans } from "../research-orphan-discovery.js";

const result = discoverResearchOrphans();

console.log("Research Orphan Discovery v1 (warning-only)");
console.log(
  `  scanned documents: ${result.stats.scannedDocumentCount}`
  + ` / unregistered: ${result.stats.unregisteredDocumentCount}`
  + ` / proven assets without relation: ${result.stats.unlinkedProvenAssetCount}`
  + ` / candidates: ${result.stats.totalCandidates}`,
);

if (result.issues.length > 0) {
  console.error(`  scanner/authority errors: ${result.issues.length}`);
  for (const entry of result.issues) {
    console.error(`  [ERROR] ${entry.code} ${entry.target}: ${entry.message}`);
  }
  console.error("Orphan discovery failed closed because the scan or an authority was incomplete.");
  process.exitCode = 1;
} else {
  const displayLimit = 100;
  for (const candidate of result.candidates.slice(0, displayLimit)) {
    const identity = candidate.assetId ? ` asset=${candidate.assetId}` : "";
    console.log(
      `  [WARN] ${candidate.classification} ${candidate.assetType} ${candidate.path}${identity}`,
    );
  }
  if (result.candidates.length > displayLimit) {
    console.log(`  ... ${result.candidates.length - displayLimit} more candidates omitted from console output`);
  }
  console.log("  Candidates are triage hints only: no Asset, ResearchItem, Edge, Relation, BUY/SELL rule, or generated authority is written.");
}
