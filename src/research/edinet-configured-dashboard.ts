import { createHash } from "node:crypto";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
  type EdinetIssuerBoundary,
} from "./edinet-issuer-boundary.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetDashboardStageKind =
  | "inventory"
  | "review_plan"
  | "acquisition_plan"
  | "acquisition_manifest"
  | "review_workspace_v2";

export type ConfiguredEdinetDashboardStage = {
  kind: ConfiguredEdinetDashboardStageKind;
  order: number;
  label: string;
  fileName: string;
  hashField: string;
  hashValue: string | null;
  integrity: "verified" | "invalid";
  safety: "safe" | "blocked";
  status: string;
  counts: Record<string, number>;
  issues: string[];
};

export type ConfiguredEdinetDashboard = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  generatedAt: string;
  stages: ConfiguredEdinetDashboardStage[];
  verifiedStageCount: number;
  invalidIntegrityCount: number;
  unsafeBoundaryCount: number;
  lineageIssueCount: number;
  dashboardStatus:
    | "blocked_integrity"
    | "blocked_lineage"
    | "blocked_boundary"
    | "pending_human_review";
  lineageChecks: Array<{
    name: string;
    expected: string;
    actual: string;
    matched: boolean;
  }>;
  warnings: string[];
  readOnly: true;
  appendAuthorized: false;
  dashboardHash: string;
};

export type ConfiguredEdinetDashboardInput = {
  registry: unknown;
  inventory: unknown;
  reviewPlan: unknown;
  acquisitionPlan: unknown;
  acquisitionManifest: unknown;
  reviewWorkspace: unknown;
  files: {
    inventory: string;
    reviewPlan: string;
    acquisitionPlan: string;
    acquisitionManifest: string;
    reviewWorkspace: string;
  };
  generatedAt?: string;
};

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function count(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function verifyHash(record: JsonObject, hashField: string): {
  integrity: "verified" | "invalid";
  hashValue: string | null;
  issue: string | null;
} {
  const expected = text(record[hashField]);
  if (!HASH_RE.test(expected)) {
    return { integrity: "invalid", hashValue: expected || null, issue: `${hashField}_missing_or_invalid` };
  }
  const { [hashField]: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) {
    return { integrity: "invalid", hashValue: expected, issue: `${hashField}_mismatch` };
  }
  return { integrity: "verified", hashValue: expected, issue: null };
}

function issuerFrom(
  record: JsonObject,
  field: string,
  boundary: EdinetIssuerBoundary,
  registryHash: string,
): string[] {
  const issues: string[] = [];
  if (text(record.registryHash) !== registryHash) issues.push("registry_hash_mismatch");
  const issuer = object(record.issuer, `${field}.issuer`);
  if (text(issuer.issuerKey) !== boundary.issuerKey) issues.push("issuer_key_mismatch");
  if (text(issuer.name) !== boundary.name) issues.push("issuer_name_mismatch");
  if (text(issuer.edinetCode).toUpperCase() !== boundary.edinetCode) issues.push("edinet_code_mismatch");
  if (text(issuer.secCode) !== boundary.secCode) issues.push("security_code_mismatch");
  if (text(issuer.boundaryHash) !== boundary.boundaryHash) issues.push("boundary_hash_mismatch");
  return issues;
}

function selectedCounts(record: JsonObject, fields: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const field of fields) {
    const value = count(record[field]);
    if (value !== null) result[field] = value;
  }
  return result;
}

function stage(input: {
  kind: ConfiguredEdinetDashboardStageKind;
  order: number;
  label: string;
  fileName: string;
  record: JsonObject;
  hashField: string;
  status: string;
  countFields: string[];
  safetyIssues: string[];
  identityIssues: string[];
}): ConfiguredEdinetDashboardStage {
  const integrity = verifyHash(input.record, input.hashField);
  const issues = [
    ...(integrity.issue ? [integrity.issue] : []),
    ...input.identityIssues,
    ...input.safetyIssues,
  ].sort();
  return {
    kind: input.kind,
    order: input.order,
    label: input.label,
    fileName: localBasename(input.fileName, `${input.kind}.fileName`),
    hashField: input.hashField,
    hashValue: integrity.hashValue,
    integrity: integrity.integrity,
    safety: input.safetyIssues.length === 0 && input.identityIssues.length === 0 ? "safe" : "blocked",
    status: input.status,
    counts: selectedCounts(input.record, input.countFields),
    issues,
  };
}

function inventorySafety(record: JsonObject): string[] {
  const issues: string[] = [];
  if (record.schemaVersion !== 1 || record.source !== "edinet") issues.push("schema_or_source_invalid");
  if (record.completeness !== "complete") issues.push("inventory_not_complete");
  if (record.factPromotionPolicy !== "human_review_required") issues.push("fact_promotion_policy_invalid");
  if (record.requireOfficialPdfVisualReview !== true) issues.push("pdf_review_boundary_invalid");
  if (record.appendAuthorized !== false) issues.push("append_boundary_invalid");
  return issues;
}

function reviewPlanSafety(record: JsonObject): string[] {
  const issues: string[] = [];
  if (record.schemaVersion !== 1 || record.source !== "edinet") issues.push("schema_or_source_invalid");
  if (record.reviewStatus !== "inventory_review_planned") issues.push("review_status_invalid");
  if (record.acquisitionAuthorized !== false) issues.push("acquisition_boundary_invalid");
  if (record.appendAuthorized !== false) issues.push("append_boundary_invalid");
  return issues;
}

function acquisitionPlanSafety(record: JsonObject): string[] {
  const issues: string[] = [];
  if (record.schemaVersion !== 1 || record.source !== "edinet") issues.push("schema_or_source_invalid");
  if (record.executionPolicy !== "explicit_local_command_only") issues.push("execution_policy_invalid");
  if (record.storageBoundary !== "local_only") issues.push("storage_boundary_invalid");
  if (record.automaticAcquisitionAuthorized !== false) issues.push("automatic_acquisition_boundary_invalid");
  if (record.appendAuthorized !== false) issues.push("append_boundary_invalid");
  return issues;
}

function manifestSafety(record: JsonObject): string[] {
  const issues: string[] = [];
  if (record.schemaVersion !== 1 || record.source !== "edinet") issues.push("schema_or_source_invalid");
  if (record.complete !== true || record.canonicalManifestWritten !== true) issues.push("canonical_manifest_incomplete");
  if (record.executionMode !== "explicit_local_command") issues.push("execution_mode_invalid");
  if (record.storageBoundary !== "local_only") issues.push("storage_boundary_invalid");
  if (record.reviewStatus !== "pending_human_review") issues.push("review_status_invalid");
  if (record.appendAuthorized !== false) issues.push("append_boundary_invalid");
  return issues;
}

function workspaceSafety(record: JsonObject): string[] {
  const issues: string[] = [];
  if (record.schemaVersion !== 2 || record.source !== "edinet") issues.push("schema_or_source_invalid");
  if (record.acquisitionComplete !== true) issues.push("acquisition_complete_invalid");
  if (record.fileIntegrityVerified !== true) issues.push("file_integrity_boundary_invalid");
  if (record.reviewStatus !== "pending_human_review") issues.push("review_status_invalid");
  if (record.foundationPreviewEligible !== false) issues.push("foundation_preview_boundary_invalid");
  if (record.appendAuthorized !== false) issues.push("append_boundary_invalid");
  return issues;
}

function lineageCheck(name: string, expected: unknown, actual: unknown) {
  const left = text(expected);
  const right = text(actual);
  return { name, expected: left, actual: right, matched: left.length > 0 && left === right };
}

export function buildConfiguredEdinetDashboard(
  input: ConfiguredEdinetDashboardInput,
): ConfiguredEdinetDashboard {
  const registry = buildEdinetIssuerRegistry(input.registry);
  const inventory = object(input.inventory, "inventory");
  const reviewPlan = object(input.reviewPlan, "reviewPlan");
  const acquisitionPlan = object(input.acquisitionPlan, "acquisitionPlan");
  const manifest = object(input.acquisitionManifest, "acquisitionManifest");
  const workspace = object(input.reviewWorkspace, "reviewWorkspace");
  const inventoryIssuer = object(inventory.issuer, "inventory.issuer");
  const boundary = resolveEdinetIssuerBoundary(
    registry,
    required(inventoryIssuer.issuerKey, "inventory.issuer.issuerKey"),
  );
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();

  const stages = [
    stage({
      kind: "inventory",
      order: 10,
      label: "Configured inventory",
      fileName: input.files.inventory,
      record: inventory,
      hashField: "inventoryHash",
      status: text(inventory.completeness) || "unknown",
      countFields: ["scannedBusinessDays"],
      safetyIssues: inventorySafety(inventory),
      identityIssues: issuerFrom(inventory, "inventory", boundary, registry.registryHash),
    }),
    stage({
      kind: "review_plan",
      order: 20,
      label: "Configured review plan",
      fileName: input.files.reviewPlan,
      record: reviewPlan,
      hashField: "reviewPlanHash",
      status: text(reviewPlan.reviewStatus) || "unknown",
      countFields: ["candidateCount", "groupCount", "plannedAcquisitionCount", "structuredDocumentPlanCount", "officialPdfPlanCount"],
      safetyIssues: reviewPlanSafety(reviewPlan),
      identityIssues: issuerFrom(reviewPlan, "reviewPlan", boundary, registry.registryHash),
    }),
    stage({
      kind: "acquisition_plan",
      order: 30,
      label: "Explicit local acquisition plan",
      fileName: input.files.acquisitionPlan,
      record: acquisitionPlan,
      hashField: "planHash",
      status: text(acquisitionPlan.executionPolicy) || "unknown",
      countFields: ["taskCount"],
      safetyIssues: acquisitionPlanSafety(acquisitionPlan),
      identityIssues: issuerFrom(acquisitionPlan, "acquisitionPlan", boundary, registry.registryHash),
    }),
    stage({
      kind: "acquisition_manifest",
      order: 40,
      label: "Complete acquisition manifest",
      fileName: input.files.acquisitionManifest,
      record: manifest,
      hashField: "manifestHash",
      status: text(manifest.reviewStatus) || "unknown",
      countFields: ["totalTasks"],
      safetyIssues: manifestSafety(manifest),
      identityIssues: issuerFrom(manifest, "acquisitionManifest", boundary, registry.registryHash),
    }),
    stage({
      kind: "review_workspace_v2",
      order: 50,
      label: "Configured review workspace v2",
      fileName: input.files.reviewWorkspace,
      record: workspace,
      hashField: "workspaceHash",
      status: text(workspace.reviewStatus) || "unknown",
      countFields: ["acquisitionCount", "documentCount", "groupCount", "structuredDocumentCount", "officialPdfCount"],
      safetyIssues: workspaceSafety(workspace),
      identityIssues: issuerFrom(workspace, "reviewWorkspace", boundary, registry.registryHash),
    }),
  ];

  const lineageChecks = [
    lineageCheck("inventory_to_review_plan", inventory.inventoryHash, reviewPlan.sourceInventoryHash),
    lineageCheck("review_plan_to_acquisition_plan", reviewPlan.reviewPlanHash, acquisitionPlan.sourceReviewPlanHash),
    lineageCheck("review_plan_to_manifest", reviewPlan.reviewPlanHash, manifest.sourceReviewPlanHash),
    lineageCheck("review_plan_to_workspace", reviewPlan.reviewPlanHash, workspace.sourceReviewPlanHash),
    lineageCheck("acquisition_plan_to_manifest", acquisitionPlan.planHash, manifest.acquisitionPlanHash),
    lineageCheck("acquisition_plan_to_workspace", acquisitionPlan.planHash, workspace.sourceAcquisitionPlanHash),
    lineageCheck("manifest_to_workspace", manifest.manifestHash, workspace.acquisitionManifestHash),
    lineageCheck("review_plan_file_to_acquisition_plan", input.files.reviewPlan, acquisitionPlan.sourceReviewPlanFile),
    lineageCheck("review_plan_file_to_workspace", input.files.reviewPlan, workspace.sourceReviewPlanFile),
    lineageCheck("acquisition_plan_file_to_workspace", input.files.acquisitionPlan, workspace.sourceAcquisitionPlanFile),
    lineageCheck("manifest_file_to_workspace", input.files.acquisitionManifest, workspace.acquisitionManifestFile),
  ];

  const invalidIntegrityCount = stages.filter(item => item.integrity === "invalid").length;
  const unsafeBoundaryCount = stages.filter(item => item.safety === "blocked").length;
  const lineageIssueCount = lineageChecks.filter(item => !item.matched).length;
  const dashboardStatus: ConfiguredEdinetDashboard["dashboardStatus"] = invalidIntegrityCount > 0
    ? "blocked_integrity"
    : lineageIssueCount > 0
      ? "blocked_lineage"
      : unsafeBoundaryCount > 0
        ? "blocked_boundary"
        : "pending_human_review";
  const warnings = [
    ...(invalidIntegrityCount > 0 ? ["one_or_more_pipeline_artifacts_failed_hash_verification"] : []),
    ...(lineageIssueCount > 0 ? ["one_or_more_pipeline_lineage_links_do_not_match"] : []),
    ...(unsafeBoundaryCount > 0 ? ["one_or_more_pipeline_safety_boundaries_are_invalid"] : []),
    "dashboard_is_read_only",
    "verified_pipeline_metadata_is_not_confirmed_filing_content",
    "foundation_and_evidence_append_not_authorized",
  ].sort();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: registry.registryHash,
    issuer: {
      issuerKey: boundary.issuerKey,
      name: boundary.name,
      edinetCode: boundary.edinetCode,
      secCode: boundary.secCode,
      boundaryHash: boundary.boundaryHash,
    },
    generatedAt,
    stages,
    verifiedStageCount: stages.filter(item => item.integrity === "verified").length,
    invalidIntegrityCount,
    unsafeBoundaryCount,
    lineageIssueCount,
    dashboardStatus,
    lineageChecks,
    warnings,
    readOnly: true as const,
    appendAuthorized: false as const,
  };
  return { ...base, dashboardHash: digest(base) };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function badge(value: string): "ok" | "bad" | "pending" {
  if (value === "verified" || value === "safe" || value === "matched") return "ok";
  if (value.startsWith("blocked") || value === "invalid") return "bad";
  return "pending";
}

function countHtml(counts: Record<string, number>): string {
  const values = Object.entries(counts);
  if (values.length === 0) return '<p class="muted">件数なし</p>';
  return `<dl class="counts">${values.map(([key, value]) =>
    `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`,
  ).join("")}</dl>`;
}

export function renderConfiguredEdinetDashboardHtml(
  dashboard: ConfiguredEdinetDashboard,
): string {
  const stages = dashboard.stages.map(item => `
    <article class="stage">
      <header><div><span class="number">${item.order}</span><h2>${escapeHtml(item.label)}</h2></div><span class="badge ${badge(item.integrity)}">${escapeHtml(item.integrity)}</span></header>
      <dl class="meta">
        <div><dt>file</dt><dd><code>${escapeHtml(item.fileName)}</code></dd></div>
        <div><dt>status</dt><dd>${escapeHtml(item.status)}</dd></div>
        <div><dt>safety</dt><dd><span class="badge ${badge(item.safety)}">${escapeHtml(item.safety)}</span></dd></div>
        <div><dt>${escapeHtml(item.hashField)}</dt><dd><code>${escapeHtml(item.hashValue ?? "invalid")}</code></dd></div>
      </dl>
      ${countHtml(item.counts)}
      <h3>Issues</h3>
      ${item.issues.length > 0 ? `<ul>${item.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : '<p class="muted">検出なし</p>'}
    </article>
  `).join("");
  const lineage = dashboard.lineageChecks.map(item => `
    <tr><td>${escapeHtml(item.name)}</td><td><span class="badge ${badge(item.matched ? "matched" : "blocked")}">${item.matched ? "matched" : "mismatch"}</span></td><td><code>${escapeHtml(item.expected)}</code></td><td><code>${escapeHtml(item.actual)}</code></td></tr>
  `).join("");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>Alpha Pon Configured EDINET Dashboard</title>
<style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif}body{margin:0;background:Canvas;color:CanvasText}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:32px 0 64px}.hero,.stage,.lineage{border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:14px;padding:20px;background:color-mix(in srgb,Canvas 94%,CanvasText 6%)}.hero{margin-bottom:18px}h1{margin:0 0 8px;font-size:clamp(24px,4vw,38px)}h2{margin:0;font-size:18px}h3{font-size:13px}.summary,.meta,.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}.summary div,.counts div{border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:10px;padding:10px}dt{font-size:12px;opacity:.65}dd{margin:4px 0 0;font-weight:650;overflow-wrap:anywhere}.stages{display:grid;gap:14px}.stage header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.stage header>div{display:flex;gap:10px;align-items:center}.number{display:grid;place-items:center;min-width:34px;height:28px;border-radius:8px;background:color-mix(in srgb,CanvasText 10%,transparent);font-size:12px}.badge{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:700}.badge.ok{background:color-mix(in srgb,#1b8f4a 18%,transparent)}.badge.pending{background:color-mix(in srgb,#c47b00 18%,transparent)}.badge.bad{background:color-mix(in srgb,#c33131 18%,transparent)}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow-wrap:anywhere}.muted{opacity:.62}.lineage{margin-top:18px;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px;border-bottom:1px solid color-mix(in srgb,CanvasText 10%,transparent);vertical-align:top}ul{padding-left:20px}.warning{border-left:4px solid #c47b00;padding-left:12px}
</style>
</head>
<body><main>
<section class="hero">
<p class="muted">Alpha Pon / configured EDINET / local-only / read-only</p>
<h1>${escapeHtml(dashboard.issuer.name)}</h1>
<p>inventoryからreview workspace v2までのhash連鎖と安全境界だけを表示します。filing本文・金額・事実・投資判断は表示しません。</p>
<p><span class="badge ${badge(dashboard.dashboardStatus)}">${escapeHtml(dashboard.dashboardStatus)}</span></p>
<dl class="summary"><div><dt>issuerKey</dt><dd>${escapeHtml(dashboard.issuer.issuerKey)}</dd></div><div><dt>EDINET / securities</dt><dd>${escapeHtml(dashboard.issuer.edinetCode)} / ${escapeHtml(dashboard.issuer.secCode)}</dd></div><div><dt>verified stages</dt><dd>${dashboard.verifiedStageCount}/${dashboard.stages.length}</dd></div><div><dt>integrity failures</dt><dd>${dashboard.invalidIntegrityCount}</dd></div><div><dt>lineage failures</dt><dd>${dashboard.lineageIssueCount}</dd></div><div><dt>safety failures</dt><dd>${dashboard.unsafeBoundaryCount}</dd></div></dl>
<div class="warning"><h3>Warnings</h3><ul>${dashboard.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
<p class="muted">registryHash: <code>${escapeHtml(dashboard.registryHash)}</code><br>boundaryHash: <code>${escapeHtml(dashboard.issuer.boundaryHash)}</code><br>dashboardHash: <code>${escapeHtml(dashboard.dashboardHash)}</code></p>
</section>
<section class="stages">${stages}</section>
<section class="lineage"><h2>Lineage checks</h2><table><thead><tr><th>check</th><th>result</th><th>expected</th><th>actual</th></tr></thead><tbody>${lineage}</tbody></table></section>
</main></body></html>\n`;
}
