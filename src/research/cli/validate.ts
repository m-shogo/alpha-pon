// Research OS — 整合性の一括検査。
// スキーマ / 重複 / 参照 / PIT / Gate / Decay をまとめて検査し、エラーがあれば exit 1。
// ChatGPT は書き込み後に必ずこれを実行する（CI でも同じものが走る）。

import { existsSync, readFileSync } from "fs";
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
  const issues: Issue[] = [
    ...holdout.issues,
    ...checkEdgeRegistry(state),
    ...checkPit(state),
    ...checkProductionIntegrity(state, holdout.accessLog, asOf),
    ...checkDecay(state, asOf),
  ];

  console.log(
    `Research OS 検査 (asOf=${asOf}): Edge ${state.edges.length} / Analog ${state.analogs.length} / Counterfactual ${state.counterfactuals.length} / Confounder ${state.confounders.length}`,
  );
  const { errors } = printIssues("整合性", issues);

  if (errors > 0) fail(`エラー ${errors} 件。修正するまで研究成果は取り込めません。`);
  console.log("\n✓ Research OS の不変条件をすべて満たしています");
}

main();
