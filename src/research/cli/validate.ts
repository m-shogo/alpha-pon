// Research OS — 整合性の一括検査。
// スキーマ / 重複 / 参照 / PIT / Gate / Decay / catalogs / council / Security Master / Evidence Storeをまとめて検査する。

import { existsSync, readFileSync } from "fs";
import { validateBitemporalEvidenceRepository } from "../bitemporal-evidence-repository.js";
import type { EvidenceStoreIssue } from "../bitemporal-evidence-store.js";
import { validateRepositoryCatalogs, type CatalogIssue } from "../catalog-validation.js";
import { checkEdgeRegistry, type Issue } from "../edge-registry.js";
import { checkDecay } from "../decay.js";
import { loadResearchState, loadSchema, paths, readJsonl, ResearchDataError } from "../io.js";
import { checkPit } from "../pit.js";
import { checkProductionIntegrity, type HoldoutAccessEntry, type HoldoutManifest } from "../promotion.js";
import { formatErrors, validate as validateSchema } from "../schema.js";
import { validateSecurityMasterRepository } from "../security-master-repository.js";
import type { SecurityMasterIssue } from "../security-master.js";
import { validatePersonaCalibrationRepository } from "../stock-pro-council-calibration-repository.js";
import { validateRepositoryCouncilLedgersGoverned } from "../stock-pro-council-ledger-hardening.js";
import { validateCouncilReplayRepository } from "../stock-pro-council-replay-repository.js";
import {
  validateRepositoryStockProCouncilV2,
  type CouncilIssue,
} from "../stock-pro-council-v2-validation.js";
import { fail, parseArgs, printIssues, todayJst } from "./common.js";

function loadHoldout(): { manifest: HoldoutManifest | null; accessLog: HoldoutAccessEntry[]; issues: Issue[] } {
  const issues: Issue[] = [];
  let manifest: HoldoutManifest | null = null;

  const manifestPath = paths.holdoutManifest();
  if (existsSync(manifestPath)) {
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const errors = validateSchema(raw, loadSchema("holdout-manifest"));
    if (errors.length > 0) {
      issues.push({
        severity: "error",
        code: "invalid_holdout_manifest",
        target: manifestPath,
        message: formatErrors(errors),
      });
    } else {
      manifest = raw as HoldoutManifest;
    }
  }

  const accessLog: HoldoutAccessEntry[] = [];
  for (const raw of readJsonl(paths.holdoutAccessLog())) {
    const errors = validateSchema(raw, loadSchema("holdout-access"));
    if (errors.length > 0) {
      issues.push({
        severity: "error",
        code: "invalid_holdout_access",
        target: paths.holdoutAccessLog(),
        message: formatErrors(errors),
      });
    } else {
      accessLog.push(raw as HoldoutAccessEntry);
    }
  }

  return { manifest, accessLog, issues };
}

function toResearchIssue(
  issue: CatalogIssue | CouncilIssue | SecurityMasterIssue | EvidenceStoreIssue,
): Issue {
  return {
    severity: issue.severity,
    code: issue.code,
    target: issue.target,
    message: issue.message,
  };
}

function main(): void {
  const { options } = parseArgs();
  const asOf = options.get("as-of") ?? todayJst();

  let state;
  try {
    state = loadResearchState();
  } catch (error) {
    if (error instanceof ResearchDataError) {
      fail(`スキーマ検証に失敗しました:\n${error.file}\n${error.details}`);
    }
    throw error;
  }

  const holdout = loadHoldout();
  const catalogs = validateRepositoryCatalogs();
  const council = validateRepositoryStockProCouncilV2();
  const ledgers = validateRepositoryCouncilLedgersGoverned();
  const replay = validateCouncilReplayRepository();
  const calibration = validatePersonaCalibrationRepository();
  const securityMaster = validateSecurityMasterRepository({ asOf });
  const evidenceStore = validateBitemporalEvidenceRepository();
  const catalogIssues = [...catalogs.dataSourceIssues, ...catalogs.edgeFamilyIssues]
    .map(toResearchIssue);
  const councilIssues = [
    ...council.catalogIssues,
    ...council.verdictIssues,
    ...ledgers.catalogIssues,
    ...ledgers.dissentIssues,
    ...ledgers.vetoIssues,
    ...ledgers.lifecycleIssues,
    ...replay.issues,
    ...calibration.issues,
    ...securityMaster.issues,
    ...evidenceStore.issues,
  ].map(toResearchIssue);

  const issues: Issue[] = [
    ...holdout.issues,
    ...checkEdgeRegistry(state),
    ...checkPit(state),
    ...checkProductionIntegrity(state, holdout.accessLog, asOf),
    ...checkDecay(state, asOf),
    ...catalogIssues,
    ...councilIssues,
  ];

  console.log(
    `Research OS 検査 (asOf=${asOf}): Edge ${state.edges.length} / Analog ${state.analogs.length} / Counterfactual ${state.counterfactuals.length} / Confounder ${state.confounders.length}`,
  );
  console.log(
    `Research Catalog: Data Source ${catalogs.sourceCount} / Technology Family ${catalogs.familyCount} / Active Edge ${catalogs.activeEdgeCount}`,
  );
  console.log(
    `Stock Pro Council v2: Persona ${council.personaCount} / Verdict ${council.verdictCount} / Dissent ${ledgers.dissentCount} / Veto ${ledgers.vetoCount} / Binding Veto ${ledgers.bindingVetoCount}`,
  );
  console.log(
    `Council Replay: Manifest ${replay.replayCount} / Eligible ${replay.eligibleCount} / Blocked ${replay.blockedCount}`,
  );
  console.log(
    `Council Calibration: Record ${calibration.calibrationCount} / Active Head ${calibration.activeHeadCount} / Eligible Head ${calibration.eligibleHeadCount}`,
  );
  console.log(
    `Security Master: Entity Record ${securityMaster.entityRecordCount} / Relationship Record ${securityMaster.relationshipRecordCount} / Active Entity ${securityMaster.activeEntityCount} / Active Relationship ${securityMaster.activeRelationshipCount} / Unresolved Entity ${securityMaster.unresolvedEntityCount} / Unresolved Relationship ${securityMaster.unresolvedRelationshipCount}`,
  );
  console.log(
    `Bitemporal Evidence: Evidence Record ${evidenceStore.evidenceRecordCount} / Relation Record ${evidenceStore.relationRecordCount} / Snapshot Evidence ${evidenceStore.snapshotEvidenceCount} / Recommendation Eligible ${evidenceStore.recommendationEligibleCount} / Corrected or Retracted ${evidenceStore.correctedOrRetractedCount} / Discovery Only ${evidenceStore.discoveryOnlyCount}`,
  );
  console.log("Catalog entries and council personas are not counted as active Research OS Edges.");

  const { errors } = printIssues("整合性", issues);
  if (errors > 0) fail(`エラー ${errors} 件。修正するまで研究成果は取り込めません。`);

  console.log("\n✓ Research OS の不変条件をすべて満たしています");
  console.log("✓ DATA_SOURCE_REGISTRY_CONTRACT_GREEN");
  console.log("✓ TECH_EDGE_CANDIDATE_CATALOG_GREEN");
  console.log("✓ STOCK_PRO_COUNCIL_V2_CONTRACT_GREEN");
  console.log("✓ COUNCIL_DISSENT_VETO_LEDGER_GREEN");
  if (replay.replayCount > 0) {
    console.log("✓ COUNCIL_DETERMINISTIC_REPLAY_GREEN");
  } else {
    console.log("Council replay contracts are present, but no local replay manifest exists; milestone remains unproven.");
  }
  if (calibration.eligibleHeadCount > 0) {
    console.log("✓ COUNCIL_CALIBRATION_V1_GREEN");
  } else {
    console.log("Council calibration contracts are present, but no eligible local calibration head exists; milestone remains unproven.");
  }
  if (securityMaster.entityRecordCount === 0) {
    console.log("Security Master contracts are present, but no local entity record exists; SECURITY_MASTER_V1_GREEN remains unproven.");
  } else {
    console.log("Security Master records are structurally valid; historical local pilot evidence is still required before SECURITY_MASTER_V1_GREEN.");
  }
  if (evidenceStore.evidenceRecordCount === 0) {
    console.log("Bitemporal Evidence Store contracts are present, but no local Evidence record exists; milestone remains unproven.");
  } else {
    console.log("Evidence Store records are structurally valid; correction before/after cutoff replay is still required before milestone green.");
  }
}

main();
