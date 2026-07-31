// Historical case selection provenance。
// 後から選んだ有名事例を、時系列holdout / prospective validationと誤認しないための契約。

import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";

export const SHOCK_CASE_SELECTION_VERSION = 1 as const;

export type ShockCaseSelectionMode =
  | "retrospective_research"
  | "prospective_pre_outcome"
  | "matched_negative_control";

export type ShockOutcomeVisibilityAtSelection =
  | "not_observed"
  | "partially_observed"
  | "known_or_available"
  | "unknown";

export type ShockCaseSelectionRecord = {
  registeredAt: string;
  selectionMode: ShockCaseSelectionMode;
  outcomeVisibilityAtSelection: ShockOutcomeVisibilityAtSelection;
  selectionReason: string;
  notes?: string | null;
};

export type ShockCaseSelectionResolution = {
  caseId: string;
  provenance: "explicit" | "legacy_untracked";
  selectionMode: ShockCaseSelectionMode | "legacy_untracked";
  outcomeVisibilityAtSelection: ShockOutcomeVisibilityAtSelection;
  registrationTimingVerified: boolean;
  validationHoldoutEligible: boolean;
  reason: string;
};

type SelectionFile = {
  version: number;
  generatedAt: string;
  description?: string;
  cases: Record<string, unknown>;
};

const DEFAULT_PATH = "data/idiosyncratic_shock_case_selection.yml";
const VALID_MODES = new Set<ShockCaseSelectionMode>([
  "retrospective_research",
  "prospective_pre_outcome",
  "matched_negative_control",
]);
const VALID_VISIBILITY = new Set<ShockOutcomeVisibilityAtSelection>([
  "not_observed",
  "partially_observed",
  "known_or_available",
  "unknown",
]);

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateShockCaseSelectionRecord(value: unknown, path = "selection"): ShockCaseSelectionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: object is required`);
  const row = value as Record<string, unknown>;
  if (!isDate(row.registeredAt)) throw new Error(`${path}.registeredAt must be YYYY-MM-DD`);
  if (typeof row.selectionMode !== "string" || !VALID_MODES.has(row.selectionMode as ShockCaseSelectionMode)) {
    throw new Error(`${path}.selectionMode is invalid`);
  }
  if (typeof row.outcomeVisibilityAtSelection !== "string" || !VALID_VISIBILITY.has(row.outcomeVisibilityAtSelection as ShockOutcomeVisibilityAtSelection)) {
    throw new Error(`${path}.outcomeVisibilityAtSelection is invalid`);
  }
  if (typeof row.selectionReason !== "string" || row.selectionReason.trim().length < 10) {
    throw new Error(`${path}.selectionReason must explain why the case entered research`);
  }
  if (row.notes != null && typeof row.notes !== "string") throw new Error(`${path}.notes must be string|null`);

  const record: ShockCaseSelectionRecord = {
    registeredAt: row.registeredAt,
    selectionMode: row.selectionMode as ShockCaseSelectionMode,
    outcomeVisibilityAtSelection: row.outcomeVisibilityAtSelection as ShockOutcomeVisibilityAtSelection,
    selectionReason: row.selectionReason,
    notes: (row.notes as string | null | undefined) ?? null,
  };

  if (record.selectionMode === "prospective_pre_outcome" && record.outcomeVisibilityAtSelection !== "not_observed") {
    throw new Error(`${path}: prospective_pre_outcome requires outcomeVisibilityAtSelection=not_observed`);
  }
  if (record.selectionMode === "retrospective_research" && record.outcomeVisibilityAtSelection === "not_observed") {
    throw new Error(`${path}: retrospective_research cannot claim not_observed outcome visibility`);
  }
  return record;
}

export function loadShockCaseSelection(path = DEFAULT_PATH): Map<string, ShockCaseSelectionRecord> {
  if (!existsSync(path)) return new Map();
  const raw = load(readFileSync(path, "utf-8")) as SelectionFile;
  if (!raw || typeof raw !== "object") throw new Error(`${path}: selection envelope is required`);
  if (raw.version !== SHOCK_CASE_SELECTION_VERSION) throw new Error(`${path}: version must be ${SHOCK_CASE_SELECTION_VERSION}`);
  if (!isDate(raw.generatedAt)) throw new Error(`${path}: generatedAt must be YYYY-MM-DD`);
  if (!raw.cases || typeof raw.cases !== "object" || Array.isArray(raw.cases)) throw new Error(`${path}: cases object is required`);

  const result = new Map<string, ShockCaseSelectionRecord>();
  for (const [id, value] of Object.entries(raw.cases)) {
    if (!id.trim()) throw new Error(`${path}: empty case id`);
    if (result.has(id)) throw new Error(`${path}: duplicate case id ${id}`);
    result.set(id, validateShockCaseSelectionRecord(value, `${path}.cases.${id}`));
  }
  return result;
}

export function resolveShockCaseSelection(
  caseId: string,
  record?: ShockCaseSelectionRecord | null,
  decisionCheckpoint?: string | null,
): ShockCaseSelectionResolution {
  if (!record) {
    return {
      caseId,
      provenance: "legacy_untracked",
      selectionMode: "legacy_untracked",
      outcomeVisibilityAtSelection: "unknown",
      registrationTimingVerified: false,
      validationHoldoutEligible: false,
      reason: "selection provenance predates the contract or is missing; use for research only, never claim prospective holdout",
    };
  }

  const checkpointValid = isDate(decisionCheckpoint);
  const registrationTimingVerified = checkpointValid && record.registeredAt <= decisionCheckpoint;
  const prospectiveClaim = record.selectionMode === "prospective_pre_outcome"
    && record.outcomeVisibilityAtSelection === "not_observed";
  const validationHoldoutEligible = prospectiveClaim && registrationTimingVerified;

  let reason: string;
  if (validationHoldoutEligible) {
    reason = "case was registered no later than its decision checkpoint while the evaluated outcome was not observed";
  } else if (prospectiveClaim && !checkpointValid) {
    reason = "prospective claim cannot be verified without a valid decision checkpoint; fail closed as research-only";
  } else if (prospectiveClaim && !registrationTimingVerified) {
    reason = `prospective registration ${record.registeredAt} is after decision checkpoint ${decisionCheckpoint}; fail closed as research-only`;
  } else {
    reason = "retrospective/control selection may be used for research but is not a prospective validation holdout";
  }

  return {
    caseId,
    provenance: "explicit",
    selectionMode: record.selectionMode,
    outcomeVisibilityAtSelection: record.outcomeVisibilityAtSelection,
    registrationTimingVerified,
    validationHoldoutEligible,
    reason,
  };
}
