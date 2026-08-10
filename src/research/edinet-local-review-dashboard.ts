import { createHash } from "node:crypto";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_BLOCKERS = 20;

type JsonObject = Record<string, unknown>;

export type EdinetDashboardArtifactInput = {
  fileName: string;
  content: unknown;
  modifiedAt: string;
  location: "acquisition" | "root";
};

export type EdinetDashboardIntegrity = "verified" | "invalid" | "not_supported";

export type EdinetDashboardArtifactKind =
  | "review_workspace"
  | "revision_diff"
  | "cross_period_triage"
  | "focused_review"
  | "source_fidelity"
  | "unmatched_anchor_inspection"
  | "human_review_input"
  | "human_review_final"
  | "review_next_batches"
  | "review_next_content"
  | "impact_review_input"
  | "impact_review_final"
  | "configured_inventory"
  | "inventory_compatibility";

export type EdinetDashboardArtifact = {
  kind: EdinetDashboardArtifactKind;
  stageOrder: number;
  label: string;
  fileName: string;
  location: "acquisition" | "root";
  generatedAt: string | null;
  modifiedAt: string;
  reviewStatus: string | null;
  integrity: EdinetDashboardIntegrity;
  hashField: string | null;
  hashValue: string | null;
  appendAuthorized: boolean | null;
  replacementAuthorized: boolean | null;
  foundationPreviewEligible: boolean | null;
  safeBoundary: boolean;
  counts: Record<string, number>;
  blockers: string[];
  historyCount: number;
  issues: string[];
};

export type EdinetLocalReviewDashboard = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  generatedAt: string;
  acquisitionDirectory: string;
  recognizedArtifactCount: number;
  latestStageCount: number;
  verifiedArtifactCount: number;
  invalidIntegrityCount: number;
  unsafeBoundaryCount: number;
  pendingHumanReviewCount: number;
  completeHumanReviewCount: number;
  dashboardStatus: "blocked_integrity" | "blocked_boundary" | "pending_human_review" | "review_complete_non_appendable";
  stages: EdinetDashboardArtifact[];
  globalWarnings: string[];
  appendAuthorized: false;
  dashboardHash: string;
};

type KindDefinition = {
  kind: EdinetDashboardArtifactKind;
  stageOrder: number;
  label: string;
  pattern: RegExp;
  location: "acquisition" | "root" | "either";
  hashField: string | null;
};

const KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "review_workspace",
    stageOrder: 10,
    label: "取得物・lineageレビュー",
    pattern: /^review-workspace\.json$/,
    location: "acquisition",
    hashField: "workspaceHash",
  },
  {
    kind: "revision_diff",
    stageOrder: 20,
    label: "訂正差分ワークスペース",
    pattern: /^revision-diff-workspace-v2\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "diffWorkspaceHash",
  },
  {
    kind: "cross_period_triage",
    stageOrder: 30,
    label: "年度横断triage",
    pattern: /^revision-diff-triage-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "triageWorkspaceHash",
  },
  {
    kind: "focused_review",
    stageOrder: 40,
    label: "重点訂正レビュー",
    pattern: /^revision-focused-review-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "focusedBundleHash",
  },
  {
    kind: "source_fidelity",
    stageOrder: 50,
    label: "API・PDF原本照合",
    pattern: /^revision-source-fidelity-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "fidelityReportHash",
  },
  {
    kind: "unmatched_anchor_inspection",
    stageOrder: 60,
    label: "未一致anchor診断",
    pattern: /^revision-unmatched-anchor-inspection-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "reportHash",
  },
  {
    kind: "human_review_input",
    stageOrder: 70,
    label: "PDF目視レビュー入力",
    pattern: /^revision-human-review-input-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "recordHash",
  },
  {
    kind: "human_review_final",
    stageOrder: 80,
    label: "PDF目視レビュー完了",
    pattern: /^revision-human-review-final-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "recordHash",
  },
  {
    kind: "review_next_batches",
    stageOrder: 90,
    label: "review_nextバッチ",
    pattern: /^revision-review-next-batches-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "workspaceHash",
  },
  {
    kind: "review_next_content",
    stageOrder: 100,
    label: "review_next全文・数値・注記",
    pattern: /^revision-review-next-content-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "bundleHash",
  },
  {
    kind: "impact_review_input",
    stageOrder: 110,
    label: "会計・内部統制・監査レビュー入力",
    pattern: /^revision-impact-review-input-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "recordHash",
  },
  {
    kind: "impact_review_final",
    stageOrder: 120,
    label: "会計・内部統制・監査レビュー完了",
    pattern: /^revision-impact-review-final-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "acquisition",
    hashField: "recordHash",
  },
  {
    kind: "configured_inventory",
    stageOrder: 130,
    label: "configured inventory",
    pattern: /^sanrio-edinet-inventory\.configured\.[A-Za-z0-9_.-]+\.json$|^sanrio-edinet-inventory\.[0-9-]+\.[0-9-]+\.[A-Za-z0-9_-]+\.json$/,
    location: "root",
    hashField: "inventoryHash",
  },
  {
    kind: "inventory_compatibility",
    stageOrder: 140,
    label: "legacy・configured互換監査",
    pattern: /^sanrio-edinet-inventory-compatibility-v1\.[A-Za-z0-9_-]+\.json$/,
    location: "root",
    hashField: "auditHash",
  },
];

const COUNT_FIELDS = [
  "acquisitionCount",
  "documentCount",
  "candidateCount",
  "sourceCandidateCount",
  "sourceClusterCount",
  "clusterCount",
  "focusLineCount",
  "matchedAnchorCount",
  "unmatchedAnchorCount",
  "pendingAnchorCount",
  "contextCandidateCount",
  "completedAnchorCount",
  "initialReviewCandidateCount",
  "deferredPairConfirmationCount",
  "estimatedInitialReviewReduction",
  "numericLineCount",
  "footnoteLineCount",
  "accountingKeywordLineCount",
  "completedCandidateCount",
  "legacyCandidateCount",
  "configuredCandidateCount",
  "matchedCandidateCount",
  "mismatchCandidateCount",
  "legacyOnlyCandidateCount",
  "configuredOnlyCandidateCount",
] as const;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
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

function canonicalDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function orderedDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function definitionFor(input: EdinetDashboardArtifactInput): KindDefinition | null {
  return KIND_DEFINITIONS.find(definition =>
    definition.pattern.test(input.fileName)
    && (definition.location === "either" || definition.location === input.location),
  ) ?? null;
}

function hashPayload(kind: EdinetDashboardArtifactKind, record: JsonObject): {
  supported: boolean;
  payload: unknown;
  ordered?: boolean;
} {
  switch (kind) {
    case "review_workspace": {
      const { workspaceHash: _ignored, ...withoutHash } = record;
      return { supported: true, payload: withoutHash, ordered: true };
    }
    case "revision_diff":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          sourceReviewWorkspaceHash: record.sourceReviewWorkspaceHash,
          pairs: record.pairs,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "cross_period_triage":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          sourceDiffWorkspaceHash: record.sourceDiffWorkspaceHash,
          clusters: record.clusters,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "focused_review":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          focusedPlanHash: record.focusedPlanHash,
          candidates: record.candidates,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "source_fidelity":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          sourceFocusedBundleHash: record.sourceFocusedBundleHash,
          sourceReviewWorkspaceHash: record.sourceReviewWorkspaceHash,
          fidelityPlanHash: record.fidelityPlanHash,
          candidates: record.candidates,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "unmatched_anchor_inspection":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          sourceFidelityReportHash: record.sourceFidelityReportHash,
          candidates: record.candidates,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "human_review_input":
    case "human_review_final":
    case "impact_review_input":
    case "impact_review_final": {
      const { recordHash: _ignored, ...withoutHash } = record;
      return { supported: true, payload: withoutHash };
    }
    case "review_next_batches":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          sourceTriageWorkspaceHash: record.sourceTriageWorkspaceHash,
          clusters: record.clusters,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "review_next_content":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          sourceBatchWorkspaceHash: record.sourceBatchWorkspaceHash,
          planHash: record.planHash,
          candidates: record.candidates,
          appendAuthorized: record.appendAuthorized,
        },
      };
    case "configured_inventory": {
      const { inventoryHash: _ignored, ...withoutHash } = record;
      return { supported: true, payload: withoutHash };
    }
    case "inventory_compatibility":
      return {
        supported: true,
        payload: {
          schemaVersion: record.schemaVersion,
          source: record.source,
          configuredInventoryHash: record.configuredInventoryHash,
          legacyInventoryFile: record.legacyInventoryFile,
          configuredInventoryFile: record.configuredInventoryFile,
          rangeMatch: record.rangeMatch,
          completenessMatch: record.completenessMatch,
          comparisons: record.comparisons,
          replacementAuthorized: record.replacementAuthorized,
          appendAuthorized: record.appendAuthorized,
        },
      };
  }
}

function integrityFor(
  definition: KindDefinition,
  record: JsonObject,
): { integrity: EdinetDashboardIntegrity; hashValue: string | null; issues: string[] } {
  const issues: string[] = [];
  if (!definition.hashField) return { integrity: "not_supported", hashValue: null, issues };
  const expected = stringValue(record[definition.hashField]);
  if (!HASH_RE.test(expected)) {
    issues.push(`${definition.hashField}_missing_or_invalid`);
    return { integrity: "invalid", hashValue: expected || null, issues };
  }
  const spec = hashPayload(definition.kind, record);
  if (!spec.supported) return { integrity: "not_supported", hashValue: expected, issues };
  const actual = spec.ordered ? orderedDigest(spec.payload) : canonicalDigest(spec.payload);
  if (actual !== expected) {
    issues.push(`${definition.hashField}_mismatch`);
    return { integrity: "invalid", hashValue: expected, issues };
  }
  return { integrity: "verified", hashValue: expected, issues };
}

function issuerIsSanrio(record: JsonObject): boolean {
  const issuer = object(record.issuer);
  if (!issuer) return false;
  return stringValue(issuer.edinetCode) === "E02655"
    && stringValue(issuer.secCode) === "81360";
}

function countsFor(record: JsonObject): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const field of COUNT_FIELDS) {
    const value = record[field];
    if (Number.isSafeInteger(value) && Number(value) >= 0) counts[field] = Number(value);
  }
  return counts;
}

function blockersFor(record: JsonObject): string[] {
  const values = Array.isArray(record.globalBlockers)
    ? record.globalBlockers
    : Array.isArray(record.blockers)
      ? record.blockers
      : [];
  return [...new Set(values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => value.trim()))]
    .sort()
    .slice(0, MAX_BLOCKERS);
}

function timestampOrNull(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    parseExplicitIso8601Instant(text, "generatedAt");
    return text;
  } catch {
    return null;
  }
}

function analyzeArtifact(
  input: EdinetDashboardArtifactInput,
  definition: KindDefinition,
  historyCount: number,
): EdinetDashboardArtifact {
  const record = object(input.content);
  if (!record) {
    return {
      kind: definition.kind,
      stageOrder: definition.stageOrder,
      label: definition.label,
      fileName: input.fileName,
      location: input.location,
      generatedAt: null,
      modifiedAt: input.modifiedAt,
      reviewStatus: null,
      integrity: "invalid",
      hashField: definition.hashField,
      hashValue: null,
      appendAuthorized: null,
      replacementAuthorized: null,
      foundationPreviewEligible: null,
      safeBoundary: false,
      counts: {},
      blockers: [],
      historyCount,
      issues: ["artifact_is_not_an_object"],
    };
  }

  const integrityResult = integrityFor(definition, record);
  const appendAuthorized = typeof record.appendAuthorized === "boolean"
    ? record.appendAuthorized
    : null;
  const replacementAuthorized = typeof record.replacementAuthorized === "boolean"
    ? record.replacementAuthorized
    : null;
  const foundationPreviewEligible = typeof record.foundationPreviewEligible === "boolean"
    ? record.foundationPreviewEligible
    : null;
  const issues = [...integrityResult.issues];
  if (record.source !== "edinet") issues.push("source_is_not_edinet");
  if (!issuerIsSanrio(record)) issues.push("issuer_is_not_sanrio");
  if (appendAuthorized !== false) issues.push("append_boundary_is_not_false");
  if (replacementAuthorized === true) issues.push("replacement_boundary_is_true");
  if (foundationPreviewEligible === true) issues.push("foundation_preview_boundary_is_true");
  const safeBoundary = appendAuthorized === false
    && replacementAuthorized !== true
    && foundationPreviewEligible !== true
    && record.source === "edinet"
    && issuerIsSanrio(record);

  return {
    kind: definition.kind,
    stageOrder: definition.stageOrder,
    label: definition.label,
    fileName: input.fileName,
    location: input.location,
    generatedAt: timestampOrNull(record.generatedAt),
    modifiedAt: input.modifiedAt,
    reviewStatus: stringValue(record.reviewStatus) || null,
    integrity: integrityResult.integrity,
    hashField: definition.hashField,
    hashValue: integrityResult.hashValue,
    appendAuthorized,
    replacementAuthorized,
    foundationPreviewEligible,
    safeBoundary,
    counts: countsFor(record),
    blockers: blockersFor(record),
    historyCount,
    issues: [...new Set(issues)].sort(),
  };
}

function recencyKey(input: EdinetDashboardArtifactInput): string {
  const record = object(input.content);
  const generatedAt = record ? timestampOrNull(record.generatedAt) : null;
  return `${generatedAt ?? input.modifiedAt}|${input.modifiedAt}|${input.fileName}`;
}

function recencyInstant(input: EdinetDashboardArtifactInput): string | null {
  const record = object(input.content);
  return (record ? timestampOrNull(record.generatedAt) : null) ?? timestampOrNull(input.modifiedAt);
}

function compareRecency(
  left: EdinetDashboardArtifactInput,
  right: EdinetDashboardArtifactInput,
): number {
  const leftInstant = recencyInstant(left);
  const rightInstant = recencyInstant(right);
  if (leftInstant && rightInstant) {
    const order = compareExplicitIso8601Instants(rightInstant, leftInstant);
    if (order !== 0) return order;
  }
  return recencyKey(right).localeCompare(recencyKey(left));
}

export function buildEdinetLocalReviewDashboard(input: {
  acquisitionDirectory: string;
  artifacts: EdinetDashboardArtifactInput[];
  generatedAt?: string;
}): EdinetLocalReviewDashboard {
  if (!/^sanrio-acquisition\.[A-Za-z0-9_-]+$/.test(input.acquisitionDirectory)) {
    throw new Error("acquisitionDirectory must be a Sanrio acquisition basename");
  }
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  parseExplicitIso8601Instant(generatedAt, "generatedAt");

  const recognized = input.artifacts
    .map(artifact => ({ artifact, definition: definitionFor(artifact) }))
    .filter((entry): entry is { artifact: EdinetDashboardArtifactInput; definition: KindDefinition } =>
      entry.definition !== null,
    );

  const grouped = new Map<EdinetDashboardArtifactKind, Array<{
    artifact: EdinetDashboardArtifactInput;
    definition: KindDefinition;
  }>>();
  for (const entry of recognized) {
    const current = grouped.get(entry.definition.kind) ?? [];
    current.push(entry);
    grouped.set(entry.definition.kind, current);
  }

  const stages: EdinetDashboardArtifact[] = [];
  for (const entries of grouped.values()) {
    entries.sort((left, right) => compareRecency(left.artifact, right.artifact));
    const latest = entries[0]!;
    stages.push(analyzeArtifact(latest.artifact, latest.definition, entries.length));
  }
  stages.sort((left, right) => left.stageOrder - right.stageOrder || left.fileName.localeCompare(right.fileName));

  const invalidIntegrityCount = stages.filter(stage => stage.integrity === "invalid").length;
  const unsafeBoundaryCount = stages.filter(stage => !stage.safeBoundary).length;
  const pendingHumanReviewCount = stages.filter(stage =>
    stage.reviewStatus === "pending_human_review" || stage.reviewStatus === "draft_human_input",
  ).length;
  const completeHumanReviewCount = stages.filter(stage => stage.reviewStatus === "complete_human_review").length;
  const dashboardStatus: EdinetLocalReviewDashboard["dashboardStatus"] = invalidIntegrityCount > 0
    ? "blocked_integrity"
    : unsafeBoundaryCount > 0
      ? "blocked_boundary"
      : pendingHumanReviewCount > 0
        ? "pending_human_review"
        : "review_complete_non_appendable";

  const globalWarnings = [
    ...(invalidIntegrityCount > 0 ? ["one_or_more_latest_artifacts_failed_hash_verification"] : []),
    ...(unsafeBoundaryCount > 0 ? ["one_or_more_latest_artifacts_failed_safety_boundary"] : []),
    ...(pendingHumanReviewCount > 0 ? ["human_review_is_still_pending"] : []),
    "dashboard_is_read_only_and_not_a_fact_promotion_boundary",
    "dashboard_does_not_authorize_foundation_or_evidence_append",
  ].sort();

  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    generatedAt,
    acquisitionDirectory: input.acquisitionDirectory,
    recognizedArtifactCount: recognized.length,
    latestStageCount: stages.length,
    verifiedArtifactCount: stages.filter(stage => stage.integrity === "verified").length,
    invalidIntegrityCount,
    unsafeBoundaryCount,
    pendingHumanReviewCount,
    completeHumanReviewCount,
    dashboardStatus,
    stages,
    globalWarnings,
    appendAuthorized: false as const,
  };
  return { ...base, dashboardHash: canonicalDigest(base) };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusClass(value: string): string {
  return value === "verified" || value === "review_complete_non_appendable" || value === "complete_human_review"
    ? "ok"
    : value === "invalid" || value.startsWith("blocked_")
      ? "bad"
      : "pending";
}

function renderCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return '<span class="muted">件数情報なし</span>';
  return `<dl class="counts">${entries.map(([key, value]) =>
    `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`,
  ).join("")}</dl>`;
}

function renderList(values: string[], emptyText: string): string {
  if (values.length === 0) return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

export function renderEdinetLocalReviewDashboardHtml(dashboard: EdinetLocalReviewDashboard): string {
  const stageCards = dashboard.stages.map(stage => `
    <article class="stage">
      <header>
        <div>
          <span class="stage-number">${escapeHtml(stage.stageOrder)}</span>
          <h2>${escapeHtml(stage.label)}</h2>
        </div>
        <span class="badge ${statusClass(stage.integrity)}">hash: ${escapeHtml(stage.integrity)}</span>
      </header>
      <dl class="meta">
        <div><dt>ファイル</dt><dd><code>${escapeHtml(stage.fileName)}</code></dd></div>
        <div><dt>場所</dt><dd>${escapeHtml(stage.location)}</dd></div>
        <div><dt>生成時刻</dt><dd>${escapeHtml(stage.generatedAt ?? "不明")}</dd></div>
        <div><dt>reviewStatus</dt><dd><span class="badge ${statusClass(stage.reviewStatus ?? "pending")}">${escapeHtml(stage.reviewStatus ?? "なし")}</span></dd></div>
        <div><dt>安全境界</dt><dd><span class="badge ${stage.safeBoundary ? "ok" : "bad"}">${stage.safeBoundary ? "safe" : "blocked"}</span></dd></div>
        <div><dt>履歴件数</dt><dd>${escapeHtml(stage.historyCount)}</dd></div>
      </dl>
      <section>
        <h3>件数</h3>
        ${renderCounts(stage.counts)}
      </section>
      <section>
        <h3>Blockers</h3>
        ${renderList(stage.blockers, "blockerなし")}
      </section>
      <section>
        <h3>Integrity / boundary issues</h3>
        ${renderList(stage.issues, "検出なし")}
      </section>
      <footer>
        <span>appendAuthorized: <strong>${escapeHtml(stage.appendAuthorized)}</strong></span>
        <span>replacementAuthorized: <strong>${escapeHtml(stage.replacementAuthorized)}</strong></span>
        <span>foundationPreviewEligible: <strong>${escapeHtml(stage.foundationPreviewEligible)}</strong></span>
      </footer>
    </article>
  `).join("");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">
  <title>Alpha Pon EDINET Local Review Dashboard</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 64px; }
    .hero, .stage { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 14px; padding: 20px; background: color-mix(in srgb, Canvas 94%, CanvasText 6%); }
    .hero { margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 38px); }
    h2 { margin: 0; font-size: 19px; }
    h3 { margin: 18px 0 8px; font-size: 14px; }
    p { line-height: 1.65; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 18px; }
    .summary div, .counts div { border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); border-radius: 10px; padding: 10px; }
    dt { color: color-mix(in srgb, CanvasText 62%, transparent); font-size: 12px; }
    dd { margin: 4px 0 0; font-weight: 650; overflow-wrap: anywhere; }
    .stages { display: grid; gap: 16px; }
    .stage header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .stage header > div { display: flex; gap: 10px; align-items: center; }
    .stage-number { display: inline-grid; place-items: center; min-width: 34px; height: 28px; border-radius: 8px; background: color-mix(in srgb, CanvasText 10%, transparent); font-size: 12px; }
    .meta, .counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 8px; }
    .meta > div { padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, CanvasText 10%, transparent); }
    .counts { margin: 0; }
    .badge { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge.ok { background: color-mix(in srgb, #1b8f4a 18%, transparent); color: color-mix(in srgb, #1b8f4a 72%, CanvasText); }
    .badge.pending { background: color-mix(in srgb, #c47b00 18%, transparent); color: color-mix(in srgb, #c47b00 76%, CanvasText); }
    .badge.bad { background: color-mix(in srgb, #c33131 18%, transparent); color: color-mix(in srgb, #c33131 74%, CanvasText); }
    ul { margin: 8px 0; padding-left: 22px; }
    li { margin: 5px 0; overflow-wrap: anywhere; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
    .muted { color: color-mix(in srgb, CanvasText 58%, transparent); }
    footer { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 18px; padding-top: 14px; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 12px; }
    .warning { border-left: 4px solid #c47b00; padding-left: 12px; }
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="muted">Alpha Pon / local-only / read-only</p>
    <h1>EDINET Review Dashboard</h1>
    <p>サンリオのEDINET調査段階を、最新のローカルJSONから表示します。この画面は閲覧専用で、事実確定・Foundation/Evidence append・旧入口置換を行いません。</p>
    <p><span class="badge ${statusClass(dashboard.dashboardStatus)}">${escapeHtml(dashboard.dashboardStatus)}</span></p>
    <dl class="summary">
      <div><dt>認識ファイル</dt><dd>${escapeHtml(dashboard.recognizedArtifactCount)}</dd></div>
      <div><dt>最新ステージ</dt><dd>${escapeHtml(dashboard.latestStageCount)}</dd></div>
      <div><dt>hash検証済み</dt><dd>${escapeHtml(dashboard.verifiedArtifactCount)}</dd></div>
      <div><dt>hash失敗</dt><dd>${escapeHtml(dashboard.invalidIntegrityCount)}</dd></div>
      <div><dt>安全境界失敗</dt><dd>${escapeHtml(dashboard.unsafeBoundaryCount)}</dd></div>
      <div><dt>human review待ち</dt><dd>${escapeHtml(dashboard.pendingHumanReviewCount)}</dd></div>
    </dl>
    <div class="warning">
      <h3>Global warnings</h3>
      ${renderList(dashboard.globalWarnings, "警告なし")}
    </div>
    <p class="muted">acquisition: ${escapeHtml(dashboard.acquisitionDirectory)} / generatedAt: ${escapeHtml(dashboard.generatedAt)} / dashboardHash: <code>${escapeHtml(dashboard.dashboardHash)}</code></p>
  </section>
  <section class="stages">
    ${stageCards || '<p class="muted">認識できるreview artifactがありません。</p>'}
  </section>
</main>
</body>
</html>\n`;
}
