import { createHash } from "node:crypto";
import { foundationMappingRemediationDefinition } from "./foundation-mapping-readiness-contract.js";

type JsonObject = Record<string, unknown>;

const HASH_RE = /^[a-f0-9]{64}$/;
const STATUS_VALUES = new Set([
  "verified_present",
  "derivable_without_semantic_inference",
  "partial_navigation_only",
  "missing_required_evidence",
]);

export type FoundationReadinessGroupStatus =
  | "verified_present"
  | "derivable_without_semantic_inference"
  | "partial_navigation_only"
  | "missing_required_evidence";

export type FoundationRemediationStepStatus =
  | "pending_explicit_evidence"
  | "pending_complete_mapping";

export type FoundationRemediationStep = {
  stepId: string;
  groupId: string;
  order: number;
  status: FoundationRemediationStepStatus;
  action: string;
  missingFields: string[];
  dependsOnGroupIds: string[];
  evidenceRefCount: number;
  note: string;
};

export type FoundationReadinessRemediationPlan = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  registryHash: string;
  sourceAuditFile: string;
  sourceAuditHash: string;
  generatedAt: string;
  sourceReadinessStatus: string;
  sourceFoundationMappingGateReady: boolean;
  stepCount: number;
  pendingFieldCount: number;
  steps: FoundationRemediationStep[];
  planStatus: "blocked_pending_explicit_evidence" | "ready_for_separate_foundation_mapping_gate_review";
  foundationMappingGateAuthorized: false;
  automaticFieldSynthesisAuthorized: false;
  automaticEvidenceCollectionAuthorized: false;
  legacyEntryPointMutationAuthorized: false;
  replacementAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  blockers: string[];
  planHash: string;
};

type VerifiedReadinessGroup = {
  groupId: string;
  status: FoundationReadinessGroupStatus;
  verifiedFields: string[];
  missingFields: string[];
  evidenceRefs: string[];
  note: string;
};

type VerifiedReadinessAudit = {
  auditHash: string;
  issuer: FoundationReadinessRemediationPlan["issuer"];
  registryHash: string;
  readinessStatus: string;
  foundationMappingGateReady: boolean;
  groups: VerifiedReadinessGroup[];
};

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function hash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (
    result === "."
    || result === ".."
    || result.includes("/")
    || result.includes("\\")
    || !result.endsWith(".json")
  ) {
    throw new Error(`${field} must be a local JSON basename`);
  }
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

function verifyHashEnvelope(record: JsonObject, hashField: string, field: string): string {
  const expected = hash(record[hashField], `${field}.${hashField}`);
  const { [hashField]: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error(`${field}.${hashField} mismatch`);
  return expected;
}

function stringArray(value: unknown, field: string): string[] {
  const result = array(value, field).map((item, index) => required(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${field} must not contain duplicates`);
  return result.sort();
}

function verifyReadinessAudit(value: unknown): VerifiedReadinessAudit {
  const audit = object(value, "readinessAudit");
  if (
    audit.schemaVersion !== 1
    || audit.source !== "edinet"
    || audit.automaticFieldSynthesisAuthorized !== false
    || audit.legacyEntryPointMutationAuthorized !== false
    || audit.replacementAuthorized !== false
    || audit.foundationPreviewEligible !== false
    || audit.appendAuthorized !== false
  ) {
    throw new Error("readinessAudit safety boundary is invalid");
  }
  const auditHash = verifyHashEnvelope(audit, "auditHash", "readinessAudit");
  const issuer = object(audit.issuer, "readinessAudit.issuer");
  const normalizedIssuer = {
    issuerKey: required(issuer.issuerKey, "readinessAudit.issuer.issuerKey"),
    name: required(issuer.name, "readinessAudit.issuer.name"),
    edinetCode: required(issuer.edinetCode, "readinessAudit.issuer.edinetCode"),
    secCode: required(issuer.secCode, "readinessAudit.issuer.secCode"),
    boundaryHash: hash(issuer.boundaryHash, "readinessAudit.issuer.boundaryHash"),
  };
  const registryHash = hash(audit.registryHash, "readinessAudit.registryHash");
  const readinessStatus = required(audit.readinessStatus, "readinessAudit.readinessStatus");
  if (
    readinessStatus !== "blocked_missing_foundation_mapping_evidence"
    && readinessStatus !== "ready_for_separate_foundation_mapping_gate"
  ) {
    throw new Error("readinessAudit.readinessStatus is invalid");
  }
  if (typeof audit.foundationMappingGateReady !== "boolean") {
    throw new Error("readinessAudit.foundationMappingGateReady must be boolean");
  }
  if (
    (readinessStatus === "blocked_missing_foundation_mapping_evidence" && audit.foundationMappingGateReady !== false)
    || (readinessStatus === "ready_for_separate_foundation_mapping_gate" && audit.foundationMappingGateReady !== true)
  ) {
    throw new Error("readinessAudit readiness status/gate flag mismatch");
  }

  const seen = new Set<string>();
  const groups = array(audit.readinessGroups, "readinessAudit.readinessGroups").map((value2, index) => {
    const item = object(value2, `readinessAudit.readinessGroups[${index}]`);
    const groupId = required(item.groupId, `readinessAudit.readinessGroups[${index}].groupId`);
    if (seen.has(groupId)) throw new Error(`readinessAudit has duplicate group ${groupId}`);
    seen.add(groupId);
    const status = required(item.status, `readinessAudit.readinessGroups[${index}].status`);
    if (!STATUS_VALUES.has(status)) throw new Error(`readinessAudit group ${groupId} status is invalid`);
    return {
      groupId,
      status: status as FoundationReadinessGroupStatus,
      verifiedFields: stringArray(item.verifiedFields, `readinessAudit group ${groupId}.verifiedFields`),
      missingFields: stringArray(item.missingFields, `readinessAudit group ${groupId}.missingFields`),
      evidenceRefs: stringArray(item.evidenceRefs, `readinessAudit group ${groupId}.evidenceRefs`),
      note: required(item.note, `readinessAudit group ${groupId}.note`),
    };
  }).sort((left, right) => left.groupId.localeCompare(right.groupId));

  const topLevelMissing = stringArray(audit.missingFields, "readinessAudit.missingFields");
  const groupMissing = [...new Set(groups.flatMap(item => item.missingFields))].sort();
  if (JSON.stringify(topLevelMissing) !== JSON.stringify(groupMissing)) {
    throw new Error("readinessAudit missingFields do not match readiness groups");
  }
  if (nonNegativeInteger(audit.missingFieldCount, "readinessAudit.missingFieldCount") !== topLevelMissing.length) {
    throw new Error("readinessAudit missingFieldCount mismatch");
  }
  if (audit.foundationMappingGateReady && groups.some(item => item.missingFields.length > 0)) {
    throw new Error("readinessAudit cannot be gate-ready while missing fields remain");
  }
  return {
    auditHash,
    issuer: normalizedIssuer,
    registryHash,
    readinessStatus,
    foundationMappingGateReady: audit.foundationMappingGateReady,
    groups,
  };
}

function buildSteps(groups: VerifiedReadinessGroup[]): FoundationRemediationStep[] {
  const pendingGroups = groups.filter(
    item => item.status === "missing_required_evidence" || item.status === "partial_navigation_only",
  );
  const pendingGroupIds = new Set(pendingGroups.map(item => item.groupId));
  return pendingGroups.map(item => {
    const definition = foundationMappingRemediationDefinition(item.groupId);
    return {
      stepId: `foundation-remediation:${item.groupId}`,
      groupId: item.groupId,
      order: definition?.order ?? 900,
      status: item.status === "partial_navigation_only"
        ? "pending_complete_mapping" as const
        : "pending_explicit_evidence" as const,
      action: definition?.action ?? "collect_explicit_foundation_mapping_evidence",
      missingFields: [...item.missingFields].sort(),
      dependsOnGroupIds: (definition?.dependsOnGroupIds ?? [])
        .filter(dependency => pendingGroupIds.has(dependency))
        .sort(),
      evidenceRefCount: item.evidenceRefs.length,
      note: item.note,
    };
  }).sort((left, right) => left.order - right.order || left.groupId.localeCompare(right.groupId));
}

export function buildFoundationReadinessRemediationPlan(input: {
  readinessAudit: unknown;
  sourceAuditFile: string;
  generatedAt?: string;
}): FoundationReadinessRemediationPlan {
  const audit = verifyReadinessAudit(input.readinessAudit);
  const sourceAuditFile = localJsonBasename(input.sourceAuditFile, "sourceAuditFile");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const steps = buildSteps(audit.groups);
  const pendingFieldCount = [...new Set(steps.flatMap(step => step.missingFields))].length;
  const planStatus = steps.length > 0
    ? "blocked_pending_explicit_evidence" as const
    : "ready_for_separate_foundation_mapping_gate_review" as const;
  if ((steps.length === 0) !== audit.foundationMappingGateReady) {
    throw new Error("readinessAudit gate state does not match remediation steps");
  }
  const blockers = [
    ...(steps.length > 0 ? ["explicit_foundation_mapping_evidence_still_missing"] : []),
    "foundation_mapping_gate_requires_separate_review",
    "automatic_field_synthesis_not_authorized",
    "automatic_evidence_collection_not_authorized",
    "legacy_entry_point_mutation_not_authorized",
    "replacement_not_authorized",
    "foundation_preview_not_eligible",
    "governed_store_append_not_authorized",
  ].sort();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: audit.issuer,
    registryHash: audit.registryHash,
    sourceAuditFile,
    sourceAuditHash: audit.auditHash,
    generatedAt,
    sourceReadinessStatus: audit.readinessStatus,
    sourceFoundationMappingGateReady: audit.foundationMappingGateReady,
    stepCount: steps.length,
    pendingFieldCount,
    steps,
    planStatus,
    foundationMappingGateAuthorized: false as const,
    automaticFieldSynthesisAuthorized: false as const,
    automaticEvidenceCollectionAuthorized: false as const,
    legacyEntryPointMutationAuthorized: false as const,
    replacementAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
    blockers,
  };
  return { ...base, planHash: digest(base) };
}

export function renderFoundationReadinessRemediationPlan(plan: FoundationReadinessRemediationPlan): string {
  const lines = [
    "# Foundation readiness remediation plan",
    "",
    `- generatedAt: ${plan.generatedAt}`,
    `- issuer: ${plan.issuer.issuerKey} / ${plan.issuer.edinetCode} / ${plan.issuer.secCode}`,
    `- sourceAuditFile: ${plan.sourceAuditFile}`,
    `- sourceAuditHash: ${plan.sourceAuditHash}`,
    `- stepCount: ${plan.stepCount}`,
    `- pendingFieldCount: ${plan.pendingFieldCount}`,
    `- planStatus: ${plan.planStatus}`,
    `- planHash: ${plan.planHash}`,
    "- foundationMappingGateAuthorized: false",
    "- automaticFieldSynthesisAuthorized: false",
    "- automaticEvidenceCollectionAuthorized: false",
    "- legacyEntryPointMutationAuthorized: false",
    "- replacementAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "This plan orders explicit evidence work only. It does not collect, infer, synthesize, append, or authorize any Foundation field.",
    "",
    "## Remediation steps",
    "",
  ];
  if (plan.steps.length === 0) {
    lines.push("No missing-evidence remediation step remains. A separate reviewed Foundation mapping gate is still required.", "");
  }
  for (const step of plan.steps) {
    lines.push(
      `### ${step.order}. ${step.groupId}`,
      "",
      `- status: ${step.status}`,
      `- action: ${step.action}`,
      `- missingFields: ${step.missingFields.join(", ") || "none"}`,
      `- dependsOn: ${step.dependsOnGroupIds.join(", ") || "none"}`,
      `- evidenceRefCount: ${step.evidenceRefCount}`,
      `- note: ${step.note}`,
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
