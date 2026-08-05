// Research OS — 整合性の一括検査。
// スキーマ / 重複 / 参照 / PIT / Gate / Decay / catalogs / council ledgersをまとめて検査する。

import { existsSync, readFileSync } from "fs";
import { validateRepositoryCatalogs, type CatalogIssue } from "../catalog-validation.js";
import { checkEdgeRegistry, type Issue } from "../edge-registry.js";
import { checkDecay } from "../decay.js";
import { loadResearchState, loadSchema, paths, readJsonl, ResearchDataError } from "../io.js";
import { checkPit } from "../pit.js";
import { checkProductionIntegrity, type HoldoutAccessEntry, type HoldoutManifest } from "../promotion.js";
import { formatErrors, validate as validateSchema } from "../schema.js";
import { validateRepositoryCouncilLedgers } from "../stock-pro-council-ledgers.js";
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

function toResearchIssue(issue: CatalogIssue | CouncilIssue): Issue {
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
  const ledgers = validateRepositoryCouncilLedgers();
  const catalogIssues = [...catalogs.dataSourceIssues, ...catalogs.edgeFamilyIssues]
    .map(toResearchIssue);
  const councilIssues = [
    ...council.catalogIssues,
    ...council.verdictIssues,
    ...ledgers.dissentIssues,
    ...ledgers.vetoIssues,
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
    `Stock Pro Council v2: Persona ${council.personaCount} / Verdict ${council.verdictCount} / Dissent ${ledgers.dissentCount} / Veto ${ledgers.vetoCount}`,
  );
  console.log("Catalog entries and council personas are not counted as active Research OS Edges.");

  const { errors } = printIssues("整合性", issues);
  if (errors > 0) fail(`エラー ${errors} 件。修正するまで研究成果は取り込めません。`);

  console.log("\n✓ Research OS の不変条件をすべて満たしています");
  console.log("✓ DATA_SOURCE_REGISTRY_CONTRACT_GREEN");
  console.log("✓ TECH_EDGE_CANDIDATE_CATALOG_GREEN");
  console.log("✓ STOCK_PRO_COUNCIL_V2_CONTRACT_GREEN");
  console.log("✓ COUNCIL_DISSENT_VETO_LEDGER_GREEN");
}

main();
