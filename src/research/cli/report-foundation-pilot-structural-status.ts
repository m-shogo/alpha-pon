import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { validateBitemporalEvidenceRepository } from "../bitemporal-evidence-repository.js";
import {
  activeClaimHeads,
  CLAIM_GRAPH_PATHS,
  parseClaimGraphJsonl,
  type ClaimRecord,
} from "../claim-contradiction-graph.js";
import { validateClaimGraphRepository } from "../claim-contradiction-graph-repository.js";
import { visibleClaimRecordsAtCutoff } from "../claim-contradiction-graph-governed.js";
import {
  DOCUMENT_REVISION_DIFF_PATHS,
  activeDocumentDiffHeads,
  activeDocumentRevisionHeads,
  parseDocumentRevisionDiffJsonl,
  type DocumentDiffRecord,
  type DocumentRevisionRecord,
} from "../document-revision-diff.js";
import { validateDocumentRevisionDiffRepository } from "../document-revision-diff-repository.js";
import { visibleDocumentDiffsAtCutoff, visibleDocumentRevisionsAtCutoff } from "../document-revision-diff-governed.js";
import { activeEvidencePackageHeads } from "../evidence-package-ledger.js";
import { validateEvidencePackageRepository } from "../evidence-package-repository.js";
import type { EvidencePackageExternalPinResolver } from "../evidence-package-governed.js";
import {
  buildFoundationPilotStructuralStatus,
  renderFoundationPilotStructuralStatus,
  type FoundationPilotStructuralObservation,
  type FoundationPilotTarget,
} from "../foundation-pilot-structural-status.js";
import { validateFoundationDecisionRepository } from "../foundation-decision-integration-repository.js";
import { parseExplicitIso8601Instant } from "../iso-instant.js";
import {
  COUNCIL_REPLAY_PATHS,
  validateCouncilReplayRepository,
} from "../stock-pro-council-replay-repository.js";
import type { CouncilReplayManifest } from "../stock-pro-council-replay.js";
import { validateSecurityMasterRepository } from "../security-master-repository.js";
import { activeHypothesisHeads, activeScenarioSetHeads } from "../testable-hypothesis-scenario-ledger.js";
import { validateHypothesisScenarioRepository } from "../testable-hypothesis-scenario-repository.js";
import { REQUIRED_SCENARIO_TYPES } from "../testable-hypothesis-scenario.js";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function requiredArg(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function timestampArg(name: string): string {
  const value = requiredArg(name);
  parseExplicitIso8601Instant(value, `--${name}`);
  return value;
}

function errorCount(issues: Array<{ severity: "error" | "warning" }>): number {
  return issues.filter(item => item.severity === "error").length;
}

function safeJsonl<T>(path: string, parser: (content: string, path: string) => T[], blocked: boolean): T[] {
  if (blocked || !existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) return [];
  try {
    return parser(content, path);
  } catch {
    return [];
  }
}

function readReplayManifests(blocked: boolean): CouncilReplayManifest[] {
  if (blocked || !existsSync(COUNCIL_REPLAY_PATHS.manifestDir)) return [];
  const records: CouncilReplayManifest[] = [];
  for (const filename of readdirSync(COUNCIL_REPLAY_PATHS.manifestDir).filter(name => name.endsWith(".json")).sort()) {
    try {
      records.push(JSON.parse(readFileSync(join(COUNCIL_REPLAY_PATHS.manifestDir, filename), "utf-8")) as CouncilReplayManifest);
    } catch {
      return [];
    }
  }
  return records;
}

function externalPins(
  prices: ReturnType<typeof validateFoundationDecisionRepository>["priceSnapshots"],
): EvidencePackageExternalPinResolver {
  const role = (name: "issuer_price" | "issuer_benchmark" | "topix_benchmark" | "sector_benchmark") =>
    new Set(prices.filter(record => record.role === name).map(record => record.contentHash));
  return {
    priceSnapshotHashes: role("issuer_price"),
    benchmarkSnapshotHashes: {
      issuer: role("issuer_benchmark"),
      topix: role("topix_benchmark"),
      sector: role("sector_benchmark"),
    },
  };
}

function sameTargetEntity(entityIds: readonly string[], target: FoundationPilotTarget): boolean {
  return entityIds.includes(target.issuerEntityId) || entityIds.includes(target.listedSecurityEntityId);
}

function buildObservation(target: FoundationPilotTarget): FoundationPilotStructuralObservation {
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(target.informationCutoff));

  const security = validateSecurityMasterRepository({ asOf: asOfDate });
  const evidence = validateBitemporalEvidenceRepository({
    asOf: target.informationCutoff,
    includeSecurityMasterIssues: false,
  });
  const claims = validateClaimGraphRepository({
    asOf: target.informationCutoff,
    includeDependencyIssues: false,
  });
  const documents = validateDocumentRevisionDiffRepository({
    asOf: target.informationCutoff,
    includeDependencyIssues: false,
  });
  const decisions = validateFoundationDecisionRepository({ includeDependencyIssues: false });
  const pins = externalPins(decisions.priceSnapshots);
  const packages = validateEvidencePackageRepository({
    externalPins: pins,
    includeDependencyIssues: false,
  });
  const hypothesis = validateHypothesisScenarioRepository({
    externalPins: pins,
    includeDependencyIssues: false,
  });
  const replay = validateCouncilReplayRepository();

  const securityErrors = errorCount(security.issues);
  const evidenceErrors = errorCount(evidence.issues);
  const claimErrors = errorCount(claims.issues);
  const documentErrors = errorCount(documents.issues);
  const packageErrors = errorCount(packages.issues);
  const hypothesisErrors = errorCount(hypothesis.issues);
  const replayErrors = errorCount(replay.issues);
  const decisionErrors = errorCount(decisions.issues);

  const listedSecurity = security.snapshot.entities.find(record =>
    record.entityId === target.listedSecurityEntityId && record.entityType === "listed_security" && record.status === "active",
  );
  const issuer = security.snapshot.entities.find(record =>
    record.entityId === target.issuerEntityId && record.entityType === "legal_entity" && record.status === "active",
  );
  const issuerRelation = security.snapshot.relationships.some(record =>
    record.relationshipType === "issuer_of"
    && record.fromEntityId === target.issuerEntityId
    && record.toEntityId === target.listedSecurityEntityId
    && record.confidence === "verified",
  );
  const listingRelation = security.snapshot.relationships.some(record =>
    record.relationshipType === "listed_on"
    && record.fromEntityId === target.listedSecurityEntityId
    && record.confidence === "verified",
  );

  const targetEvidence = evidence.snapshot.evidence.filter(record => sameTargetEntity(record.entityIds, target));
  const targetEvidenceIds = new Set(targetEvidence.map(record => record.evidenceId));
  const targetRelations = evidence.snapshot.relations.filter(record =>
    targetEvidenceIds.has(record.fromEvidenceId) || targetEvidenceIds.has(record.toEvidenceId),
  );

  const rawClaims = safeJsonl<ClaimRecord>(
    CLAIM_GRAPH_PATHS.claims,
    parseClaimGraphJsonl,
    claimErrors > 0,
  );
  const visibleTargetClaims = visibleClaimRecordsAtCutoff(rawClaims, target.informationCutoff)
    .filter(record => sameTargetEntity(record.entityIds, target));
  const activeTargetClaims = activeClaimHeads(visibleTargetClaims);
  const classCount = (claimClass: ClaimRecord["claimClass"]) =>
    activeTargetClaims.filter(record => record.claimClass === claimClass).length;

  const rawRevisions = safeJsonl<DocumentRevisionRecord>(
    DOCUMENT_REVISION_DIFF_PATHS.revisions,
    parseDocumentRevisionDiffJsonl,
    documentErrors > 0,
  );
  const rawDiffs = safeJsonl<DocumentDiffRecord>(
    DOCUMENT_REVISION_DIFF_PATHS.diffs,
    parseDocumentRevisionDiffJsonl,
    documentErrors > 0,
  );
  const targetRevisions = activeDocumentRevisionHeads(
    visibleDocumentRevisionsAtCutoff(rawRevisions, target.informationCutoff)
      .filter(record => sameTargetEntity(record.entityIds, target)),
  );
  const targetDocumentIds = new Set(targetRevisions.map(record => record.documentId));
  const targetDiffs = activeDocumentDiffHeads(
    visibleDocumentDiffsAtCutoff(rawDiffs, target.informationCutoff)
      .filter(record => targetDocumentIds.has(record.documentId)),
  );

  const targetPrices = decisions.priceSnapshots.filter(record =>
    record.candidateId === target.candidateId
    && record.listedSecurityEntityId === target.listedSecurityEntityId
    && record.informationCutoff === target.informationCutoff,
  );
  const priceCount = (role: (typeof targetPrices)[number]["role"]) =>
    targetPrices.filter(record => record.role === role).length;

  const targetPackages = activeEvidencePackageHeads(packages.manifests).filter(record =>
    record.candidateId === target.candidateId
    && record.listedSecurityEntityId === target.listedSecurityEntityId
    && record.informationCutoff === target.informationCutoff,
  );
  const completePackages = targetPackages.filter(record => record.status === "complete" && record.blockers.length === 0);
  const completePackageHashes = new Set(completePackages.map(record => record.contentHash));

  const targetHypotheses = activeHypothesisHeads(hypothesis.hypotheses).filter(record =>
    record.candidateId === target.candidateId
    && record.listedSecurityEntityId === target.listedSecurityEntityId
    && record.informationCutoff === target.informationCutoff
    && completePackageHashes.has(record.evidencePackageHash),
  );
  const registeredHypotheses = targetHypotheses.filter(record => record.status === "registered");
  const registeredHypothesisIds = new Set(registeredHypotheses.map(record => record.hypothesisId));
  const scenarioById = new Map(hypothesis.scenarios.map(record => [record.scenarioId, record]));
  const targetScenarioSets = activeScenarioSetHeads(hypothesis.scenarioSets).filter(record =>
    registeredHypothesisIds.has(record.hypothesisId)
    && record.informationCutoff === target.informationCutoff,
  );
  const requiredTypes = new Set(REQUIRED_SCENARIO_TYPES);
  const registeredFourSets = targetScenarioSets.filter(setRecord => {
    if (setRecord.status !== "registered" || setRecord.scenarioIds.length !== 4) return false;
    const records = setRecord.scenarioIds.map(id => scenarioById.get(id)).filter(record => record !== undefined);
    return records.length === 4
      && records.every(record => record.status === "registered" && registeredHypothesisIds.has(record.hypothesisId))
      && new Set(records.map(record => record.scenarioType)).size === requiredTypes.size
      && records.every(record => requiredTypes.has(record.scenarioType));
  });

  const replayManifests = readReplayManifests(replayErrors > 0).filter(record =>
    record.informationCutoff === target.informationCutoff
    && completePackageHashes.has(record.evidencePackageHash),
  );
  const targetReplayIds = new Set(replayManifests.map(record => record.replayId));
  const targetReplayResults = replay.results.filter(record => targetReplayIds.has(record.replayId));

  const targetDecisions = decisions.records.filter(record =>
    record.candidateId === target.candidateId
    && record.listedSecurityEntityId === target.listedSecurityEntityId
    && record.informationCutoff === target.informationCutoff,
  );

  return {
    validationIssueCounts: {
      securityMaster: securityErrors,
      evidenceStore: evidenceErrors,
      claimGraph: claimErrors,
      documentRevision: documentErrors,
      evidencePackage: packageErrors,
      hypothesisScenario: hypothesisErrors,
      councilReplay: replayErrors,
      foundationDecision: decisionErrors,
    },
    security: {
      listedSecurityPresent: Boolean(listedSecurity),
      issuerPresent: Boolean(issuer),
      verifiedIssuerRelationshipPresent: issuerRelation,
      verifiedListingRelationshipPresent: listingRelation,
    },
    evidence: {
      targetEvidenceCount: targetEvidence.length,
      primaryEvidenceCount: targetEvidence.filter(record =>
        record.evidenceTier === "primary_authoritative" || record.evidenceTier === "primary_company",
      ).length,
      targetRelationCount: targetRelations.length,
      correctionLikeRelationCount: targetRelations.filter(record =>
        ["corrects", "retracts", "supersedes", "invalidates"].includes(record.relationType),
      ).length,
    },
    claims: {
      targetClaimCount: visibleTargetClaims.length,
      activeTargetClaimCount: activeTargetClaims.length,
      classCounts: {
        fact: classCount("fact"),
        assumption: classCount("assumption"),
        forecast: classCount("forecast"),
        opinion: classCount("opinion"),
        unknown: classCount("unknown"),
      },
    },
    documents: {
      targetRevisionCount: targetRevisions.length,
      targetDiffCount: targetDiffs.length,
      correctionLikeRevisionCount: targetRevisions.filter(record =>
        ["amendment", "correction", "restatement", "replacement", "withdrawal"].includes(record.revisionKind),
      ).length,
      reviewedOrConfirmedDiffCount: targetDiffs.filter(record =>
        record.reviewStatus === "reviewed" || record.reviewStatus === "confirmed",
      ).length,
    },
    prices: {
      issuerPriceCount: priceCount("issuer_price"),
      issuerBenchmarkCount: priceCount("issuer_benchmark"),
      topixBenchmarkCount: priceCount("topix_benchmark"),
      sectorBenchmarkCount: priceCount("sector_benchmark"),
    },
    packages: {
      targetManifestCount: targetPackages.length,
      completeTargetPackageCount: completePackages.length,
      activeCompleteTargetPackageHashes: [...completePackageHashes].sort(),
    },
    hypotheses: {
      targetHypothesisCount: targetHypotheses.length,
      registeredTargetHypothesisCount: registeredHypotheses.length,
      registeredTargetHypothesisIds: [...registeredHypothesisIds].sort(),
    },
    scenarios: {
      targetScenarioSetCount: targetScenarioSets.length,
      registeredFourScenarioSetCount: registeredFourSets.length,
    },
    replay: {
      targetReplayCount: targetReplayResults.length,
      eligibleTargetReplayCount: targetReplayResults.filter(record => record.eligibleForRecommendationCandidate).length,
    },
    decisions: {
      targetDecisionCount: targetDecisions.length,
      eligibleTargetDecisionCount: targetDecisions.filter(record =>
        record.status === "eligible" && record.eligibleForRecommendationCandidate,
      ).length,
      blockedTargetDecisionCount: targetDecisions.filter(record => record.status === "blocked").length,
    },
  };
}

function writeExclusive(path: string, content: string): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function main(): void {
  const target: FoundationPilotTarget = {
    candidateId: requiredArg("candidate-id"),
    listedSecurityEntityId: requiredArg("listed-security-entity-id"),
    issuerEntityId: requiredArg("issuer-entity-id"),
    informationCutoff: timestampArg("information-cutoff"),
  };
  const generatedAt = new Date();
  const status = buildFoundationPilotStructuralStatus({
    target,
    observation: buildObservation(target),
    generatedAt: generatedAt.toISOString(),
  });

  console.log("Foundation real-pilot structural status");
  console.log(`target: ${target.candidateId} / ${target.listedSecurityEntityId} / ${target.issuerEntityId}`);
  console.log(`informationCutoff: ${target.informationCutoff}`);
  for (const item of status.stages) {
    console.log(`${item.ordinal}. ${item.stageId}: ${item.status}`);
  }
  console.log(`structuralStatus: ${status.structuralStatus}`);
  console.log(`firstIncompleteStageId: ${status.firstIncompleteStageId ?? "none"}`);
  console.log(`nextAction: ${status.nextAction}`);
  console.log(`contentHash: ${status.contentHash}`);
  console.log(`realEvidenceProven: ${status.realEvidenceProven}`);
  console.log(`milestoneGreenAuthorized: ${status.milestoneGreenAuthorized}`);
  console.log(`automaticTradingAuthorized: ${status.automaticTradingAuthorized}`);

  if (hasFlag("write-local")) {
    const directory = resolve(process.cwd(), "reports");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const token = stamp(generatedAt);
    const jsonPath = join(directory, `foundation-pilot-structural-status.${token}.json`);
    const mdPath = join(directory, `foundation-pilot-structural-status.${token}.md`);
    writeExclusive(jsonPath, `${JSON.stringify(status, null, 2)}\n`);
    writeExclusive(mdPath, renderFoundationPilotStructuralStatus(status));
    console.log(`local JSON: ${jsonPath}`);
    console.log(`local Markdown: ${mdPath}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown Foundation pilot status error";
  console.error(`Foundation pilot structural status failed: ${message}`);
  process.exitCode = 1;
}
