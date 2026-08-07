import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import {
  inspectSanrioRealPilotPreflight,
  type SanrioRealPilotPreflightResult,
} from "./edinet-sanrio-real-pilot-preflight.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_JSON_BYTES = 30 * 1024 * 1024;
type JsonObject = Record<string, unknown>;

type SelectedArtifact = {
  relativePath: string;
  record: JsonObject;
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

function hash(value: unknown, field: string): string {
  const result = text(value);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
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

function resolveSelected(root: string, relativePath: string, field: string): SelectedArtifact {
  const path = resolve(root, relativePath);
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`${field} escaped EDINET root`);
  }
  const linkStat = lstatSync(path);
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw new Error(`${field} must be a regular non-symlink file`);
  }
  const fileStat = statSync(path);
  if (fileStat.size <= 0 || fileStat.size > MAX_JSON_BYTES) {
    throw new Error(`${field} size is invalid`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
  return { relativePath: rel.replace(/\\/g, "/"), record: object(parsed, field) };
}

function verifyEnvelopeHash(record: JsonObject, hashField: string, field: string): string {
  const expected = hash(record[hashField], `${field}.${hashField}`);
  const withoutHash = Object.fromEntries(Object.entries(record).filter(([key]) => key !== hashField));
  if (digest(withoutHash) !== expected) throw new Error(`${field}.${hashField} mismatch`);
  return expected;
}

function verifyInspection(record: JsonObject): string {
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || record.reviewStatus !== "pending_human_review"
    || record.appendAuthorized !== false
  ) {
    throw new Error("inspection safety boundary is invalid");
  }
  const expected = hash(record.reportHash, "inspection.reportHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceFidelityReportHash: hash(record.sourceFidelityReportHash, "inspection.sourceFidelityReportHash"),
    candidates: record.candidates,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("inspection.reportHash mismatch");
  return expected;
}

function verifyInventory(record: JsonObject): string {
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || record.migrationReadyForHumanReview !== true
    || record.replacementAuthorized !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("inventory audit safety boundary is invalid");
  }
  const expected = hash(record.auditHash, "inventoryAudit.auditHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    configuredInventoryHash: hash(record.configuredInventoryHash, "inventoryAudit.configuredInventoryHash"),
    legacyInventoryFile: record.legacyInventoryFile,
    configuredInventoryFile: record.configuredInventoryFile,
    rangeMatch: record.rangeMatch,
    completenessMatch: record.completenessMatch,
    comparisons: record.comparisons,
    replacementAuthorized: record.replacementAuthorized,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("inventoryAudit.auditHash mismatch");
  return expected;
}

function requireParentHash(record: JsonObject, field: string, expected: string, target: string): void {
  if (hash(record[field], `${target}.${field}`) !== expected) {
    throw new Error(`${target}.${field} mismatch`);
  }
}

function requireSourceName(record: JsonObject, field: string, expectedPath: string, target: string): void {
  const expected = basename(expectedPath);
  if (text(record[field]) !== expected) throw new Error(`${target}.${field} mismatch`);
}

export function assertSanrioRealPilotPreflightIntegrity(
  result: SanrioRealPilotPreflightResult,
  edinetRoot: string,
): void {
  const root = resolve(edinetRoot);
  const selected = result.selectedFiles;
  if (!selected.inspection) return;

  const inspection = resolveSelected(root, selected.inspection, "inspection");
  const inspectionHash = verifyInspection(inspection.record);

  if (selected.humanReviewInput) {
    const input = resolveSelected(root, selected.humanReviewInput, "humanReviewInput");
    requireSourceName(input.record, "sourceInspectionFile", inspection.relativePath, "humanReviewInput");
    requireParentHash(input.record, "sourceInspectionHash", inspectionHash, "humanReviewInput");
    if (input.record.reviewStatus !== "draft_human_input" || input.record.appendAuthorized !== false) {
      throw new Error("humanReviewInput safety boundary is invalid");
    }
  }

  let humanDecisionHash: string | null = null;
  if (selected.humanReviewDecision) {
    const decision = resolveSelected(root, selected.humanReviewDecision, "humanReviewDecision");
    requireSourceName(decision.record, "sourceInspectionFile", inspection.relativePath, "humanReviewDecision");
    requireParentHash(decision.record, "sourceInspectionHash", inspectionHash, "humanReviewDecision");
    if (
      decision.record.reviewStatus !== "complete_human_review"
      || decision.record.foundationPreviewEligible !== false
      || decision.record.appendAuthorized !== false
    ) {
      throw new Error("humanReviewDecision safety boundary is invalid");
    }
    humanDecisionHash = verifyEnvelopeHash(decision.record, "recordHash", "humanReviewDecision");
  }

  let inventoryHash: string | null = null;
  if (selected.inventoryAudit) {
    const inventory = resolveSelected(root, selected.inventoryAudit, "inventoryAudit");
    inventoryHash = verifyInventory(inventory.record);
  }

  let configuredHash: string | null = null;
  if (selected.configuredReview) {
    const configured = resolveSelected(root, selected.configuredReview, "configuredReview");
    if (
      configured.record.schemaVersion !== 1
      || configured.record.source !== "edinet"
      || configured.record.reviewStatus !== "complete_human_comparison_review"
      || configured.record.foundationPreviewEligible !== false
      || configured.record.appendAuthorized !== false
    ) {
      throw new Error("configuredReview safety boundary is invalid");
    }
    configuredHash = verifyEnvelopeHash(configured.record, "recordHash", "configuredReview");
  }

  let workspaceHash: string | null = null;
  if (selected.parityWorkspace) {
    if (!humanDecisionHash || !inventoryHash || !configuredHash) {
      throw new Error("parityWorkspace selected without all verified parent hashes");
    }
    const workspace = resolveSelected(root, selected.parityWorkspace, "parityWorkspace");
    if (
      workspace.record.schemaVersion !== 1
      || workspace.record.source !== "edinet"
      || workspace.record.machineStatus !== "parity_workspace_ready_for_human_mapping"
      || workspace.record.semanticEquivalenceInferred !== false
      || workspace.record.replacementAuthorized !== false
      || workspace.record.foundationPreviewEligible !== false
      || workspace.record.appendAuthorized !== false
    ) {
      throw new Error("parityWorkspace safety boundary is invalid");
    }
    requireParentHash(workspace.record, "sourceInventoryAuditHash", inventoryHash, "parityWorkspace");
    requireParentHash(workspace.record, "sourceLegacyReviewHash", humanDecisionHash, "parityWorkspace");
    requireParentHash(workspace.record, "sourceConfiguredReviewHash", configuredHash, "parityWorkspace");
    workspaceHash = verifyEnvelopeHash(workspace.record, "workspaceHash", "parityWorkspace");
  }

  if (selected.parityReviewInput) {
    if (!workspaceHash || !selected.parityWorkspace) {
      throw new Error("parityReviewInput selected without verified workspace");
    }
    const input = resolveSelected(root, selected.parityReviewInput, "parityReviewInput");
    requireSourceName(input.record, "sourceWorkspaceFile", selected.parityWorkspace, "parityReviewInput");
    requireParentHash(input.record, "sourceWorkspaceHash", workspaceHash, "parityReviewInput");
    if (
      input.record.reviewStatus !== "draft_human_input"
      || input.record.replacementAuthorized !== false
      || input.record.foundationPreviewEligible !== false
      || input.record.appendAuthorized !== false
    ) {
      throw new Error("parityReviewInput safety boundary is invalid");
    }
  }

  if (selected.parityReviewRecord) {
    if (!workspaceHash || !selected.parityWorkspace) {
      throw new Error("parityReviewRecord selected without verified workspace");
    }
    const record = resolveSelected(root, selected.parityReviewRecord, "parityReviewRecord");
    requireSourceName(record.record, "sourceWorkspaceFile", selected.parityWorkspace, "parityReviewRecord");
    requireParentHash(record.record, "sourceWorkspaceHash", workspaceHash, "parityReviewRecord");
    if (
      record.record.reviewStatus !== "complete_human_parity_review"
      || record.record.semanticEquivalenceInferred !== false
      || record.record.legacyEntryPointMutationAuthorized !== false
      || record.record.replacementAuthorized !== false
      || record.record.foundationPreviewEligible !== false
      || record.record.appendAuthorized !== false
    ) {
      throw new Error("parityReviewRecord safety boundary is invalid");
    }
    verifyEnvelopeHash(record.record, "recordHash", "parityReviewRecord");
  }
}

export function inspectSanrioRealPilotPreflightWithIntegrity(
  edinetRoot = resolve(process.cwd(), "data/edinet"),
): SanrioRealPilotPreflightResult {
  const result = inspectSanrioRealPilotPreflight(edinetRoot);
  if (result.stage !== "missing_edinet_root" && result.stage !== "inspection_required") {
    assertSanrioRealPilotPreflightIntegrity(result, edinetRoot);
  }
  return result;
}
