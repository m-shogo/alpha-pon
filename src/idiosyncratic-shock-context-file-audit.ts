// Historical context / reaction-anchor YAML全ファイルの決定的データ契約audit。
// ネット不要。base + expansionのtop-level envelopeと全case shapeを一括検証する。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { validateHistoricalContextEnvelope } from "./idiosyncratic-shock-context-envelope.js";
import {
  validateHistoricalShockCaseContextShape,
  validateHistoricalShockReactionAnchorShape,
} from "./idiosyncratic-shock-case-context-validation.js";

const CONTEXT_PATTERN = /^idiosyncratic_shock_case_context(?:_expansion_\d+)?\.yml$/;
const ANCHOR_PATTERN = /^idiosyncratic_shock_reaction_anchors(?:_expansion_\d+)?\.yml$/;

type AuditedFile = {
  path: string;
  kind: "context" | "reaction_anchor";
  caseCount: number;
  generatedAt: string | null;
  ok: boolean;
  errors: string[];
};

function filesMatching(pattern: RegExp): string[] {
  if (!existsSync("data")) return [];
  return readdirSync("data")
    .filter(name => pattern.test(name))
    .sort()
    .map(name => join("data", name));
}

function auditFile(path: string, kind: AuditedFile["kind"]): AuditedFile {
  const errors: string[] = [];
  let caseCount = 0;
  let generatedAt: string | null = null;
  try {
    const raw = load(readFileSync(path, "utf-8"));
    const envelope = validateHistoricalContextEnvelope(raw, path);
    generatedAt = envelope.generatedAt;
    const entries = Object.entries(envelope.cases);
    caseCount = entries.length;
    for (const [id, value] of entries) {
      try {
        if (kind === "context") validateHistoricalShockCaseContextShape(value, `${path}.cases.${id}`);
        else validateHistoricalShockReactionAnchorShape(value, `${path}.cases.${id}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { path, kind, caseCount, generatedAt, ok: errors.length === 0, errors };
}

function main(): void {
  const date = todayJst();
  const contextFiles = filesMatching(CONTEXT_PATTERN);
  const anchorFiles = filesMatching(ANCHOR_PATTERN);
  const files = [
    ...contextFiles.map(path => auditFile(path, "context" as const)),
    ...anchorFiles.map(path => auditFile(path, "reaction_anchor" as const)),
  ];
  const issues: string[] = [];
  if (contextFiles.length === 0) issues.push("no historical context YAML files found");
  if (anchorFiles.length === 0) issues.push("no reaction anchor YAML files found");
  for (const file of files) {
    for (const error of file.errors) issues.push(`${file.path}: ${error}`);
  }

  const duplicateContextIds = new Map<string, string[]>();
  const duplicateAnchorIds = new Map<string, string[]>();
  const collectIds = (paths: string[], target: Map<string, string[]>) => {
    for (const path of paths) {
      try {
        const envelope = validateHistoricalContextEnvelope(load(readFileSync(path, "utf-8")), path);
        for (const id of Object.keys(envelope.cases)) target.set(id, [...(target.get(id) ?? []), path]);
      } catch {
        // parse/shape error already captured above.
      }
    }
  };
  collectIds(contextFiles, duplicateContextIds);
  collectIds(anchorFiles, duplicateAnchorIds);
  for (const [id, paths] of duplicateContextIds) {
    if (paths.length > 1) issues.push(`duplicate context id=${id}: ${paths.join(", ")}`);
  }
  for (const [id, paths] of duplicateAnchorIds) {
    if (paths.length > 1) issues.push(`duplicate reaction anchor id=${id}: ${paths.join(", ")}`);
  }

  const summary = {
    generatedAt: date,
    contextFiles: contextFiles.length,
    anchorFiles: anchorFiles.length,
    contextCases: files.filter(row => row.kind === "context").reduce((sum, row) => sum + row.caseCount, 0),
    anchorCases: files.filter(row => row.kind === "reaction_anchor").reduce((sum, row) => sum + row.caseCount, 0),
    files,
    issues,
    ok: issues.length === 0,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_context_file_audit_latest.json", JSON.stringify(summary, null, 2), "utf-8");
  const md = [
    "# 企業固有ショック Context File Audit",
    "",
    `生成日: ${date}`,
    `- context files: ${summary.contextFiles}`,
    `- reaction-anchor files: ${summary.anchorFiles}`,
    `- context cases: ${summary.contextCases}`,
    `- anchor cases: ${summary.anchorCases}`,
    `- RESULT: **${summary.ok ? "OK" : "NG"}**`,
    "",
    "## files",
    "",
    ...files.map(row => `- ${row.ok ? "OK" : "NG"} ${row.path}: ${row.caseCount} cases, generatedAt=${row.generatedAt ?? "-"}`),
    "",
    "## issues",
    "",
    ...(issues.length ? issues.map(value => `- ${value}`) : ["- none"]),
  ].join("\n");
  writeFileSync("reports/idiosyncratic_shock_context_file_audit_latest.md", md, "utf-8");

  console.log(`shock context file audit: contextFiles=${summary.contextFiles} anchorFiles=${summary.anchorFiles} contextCases=${summary.contextCases} anchorCases=${summary.anchorCases} issues=${issues.length}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
