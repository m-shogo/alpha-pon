// Research OS — 整合性の一括検査。
// スキーマ / 重複 / 参照 / PIT / Gate / Decay / catalogs / Claim Graph / Document Revision をまとめて検査する。

import { existsSync, readFileSync } from "fs";
import { validateRepositoryCatalogs, type CatalogIssue } from "../catalog-validation.js";
import {
  validateClaimGraphRepository,
} from "../claim-contradiction-graph-repository.js";
import {
  validateDocumentRevisionDiffRepository,
} from "../document-revision-diff-repository.js";
import { checkEdgeRegistry, type Issue } from "../edge-registry.js";
import { checkDecay } from "../decay.js";
import { loadResearchState, loadSchema, paths, readJsonl, ResearchDataError } from "../io.js";
import { checkPit } from "../pit.js";
import { checkProductionIntegrity, type HoldoutAccessEntry, type HoldoutManifest } from "../promotion.js";
import { formatErrors, validate as validateSchema } from "../schema.js";
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

function toResearchIssue(issue: CatalogIssue): Issue {
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
  const foundationAsOf = options.get("foundation-as-of") ?? new Date().toISOString();

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
  const claimGraph = validateClaimGraphRepository({ asOf: foundationAsOf });
  const documentRevision = validateDocumentRevisionDiffRepository({
    asOf: foundationAsOf,
    includeDependencyIssues: false,
  });
  const catalogIssues = [...catalogs.dataSourceIssues, ...catalogs.edgeFamilyIssues]
    .map(toResearchIssue);
  const claimGraphIssues: Issue[] = claimGraph.issues.map((item) => ({
    severity: item.severity,
    code: item.code,
    target: item.target,
    message: item.message,
  }));
  const documentRevisionIssues: Issue[] = documentRevision.issues.map((item) => ({
    severity: item.severity,
    code: item.code,
    target: item.target,
    message: item.message,
  }));

  const issues: Issue[] = [
    ...holdout.issues,
    ...checkEdgeRegistry(state),
    ...checkPit(state),
    ...checkProductionIntegrity(state, holdout.accessLog, asOf),
    ...checkDecay(state, asOf),
    ...catalogIssues,
    ...claimGraphIssues,
    ...documentRevisionIssues,
  ];

  console.log(
    `Research OS 検査 (asOf=${asOf}): Edge ${state.edges.length} / Analog ${state.analogs.length} / Counterfactual ${state.counterfactuals.length} / Confounder ${state.confounders.length}`,
  );
  console.log(
    `Research Catalog: Data Source ${catalogs.sourceCount} / Technology Family ${catalogs.familyCount} / Active Edge ${catalogs.activeEdgeCount}`,
  );
  console.log(
    `Claim Graph (asOf=${foundationAsOf}): Claim records ${claimGraph.claimRecordCount} / Edge records ${claimGraph.edgeRecordCount} / Snapshot claims ${claimGraph.snapshotClaimCount} / Eligible ${claimGraph.recommendationEligibleClaimCount} / Blocked ${claimGraph.blockedClaimCount}`,
  );
  console.log(
    `Document Revision/Diff (asOf=${foundationAsOf}): Revision records ${documentRevision.revisionRecordCount} / Diff records ${documentRevision.diffRecordCount} / Snapshot revisions ${documentRevision.snapshotRevisionCount} / Snapshot diffs ${documentRevision.snapshotDiffCount} / Claim-eligible changes ${documentRevision.claimEligibleChangeCount}`,
  );
  console.log("Catalog entries, Claims and Document revisions are not counted as active Research OS Edges.");

  const { errors } = printIssues("整合性", issues);
  if (errors > 0) fail(`エラー ${errors} 件。修正するまで研究成果は取り込めません。`);

  console.log("\n✓ Research OS の不変条件をすべて満たしています");
  console.log("✓ DATA_SOURCE_REGISTRY_CONTRACT_GREEN");
  console.log("✓ TECH_EDGE_CANDIDATE_CATALOG_GREEN");
  if (claimGraph.claimRecordCount > 0) {
    console.log("✓ CLAIM_CONTRADICTION_GRAPH_RECORDS_VALID");
  } else {
    console.log("Claim Graph contracts are present, but no local Claim record exists; milestone remains unproven.");
  }
  if (documentRevision.revisionRecordCount > 0) {
    console.log("✓ DOCUMENT_REVISION_DIFF_RECORDS_VALID");
  } else {
    console.log("Document Revision/Diff contracts are present, but no local revision record exists; milestone remains unproven.");
  }
}

main();