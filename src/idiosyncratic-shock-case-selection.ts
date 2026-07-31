// Historical case selection provenance。
// 後から選んだ有名事例を、時系列holdout / prospective validationと誤認しないための契約。

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";

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
  /** prospective caseは登録時に使ったdecision checkpointをfreezeする。 */
  decisionCheckpointAtRegistration?: string | null;
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
const SELECTION_EXPANSION_PATTERN = /^idiosyncratic_shock_case_selection_expansion_\d+\.yml$/;
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
let historicalCheckpointById: Map<string, string> | null = null;

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function knownHistoricalCheckpoint(caseId: string): string | null {
  if (historicalCheckpointById == null) {
    // Dataset failureを「checkpoint不明」として握りつぶすとprospective照合がfail-openになる。
    // 読み込みエラーはそのまま上位へ伝播させる。
    historicalCheckpointById = new Map(loadHistoricalShockCases().map(item => [item.id, item.decisionCheckpoint]));
  }
  return historicalCheckpointById.get(caseId) ?? null;
}

export function validateShockCaseSelectionRecord(value: unknown, path = "selection"): ShockCaseSelectionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: object is required`);
  const row = value as Record<string, unknown>;
  if (!isDate(row.registeredAt)) throw new Error(`${path}.registeredAt must be YYYY-MM-DD`);
  if (row.decisionCheckpointAtRegistration != null && !isDate(row.decisionCheckpointAtRegistration)) {
    throw new Error(`${path}.decisionCheckpointAtRegistration must be YYYY-MM-DD|null`);
  }
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
    decisionCheckpointAtRegistration: (row.decisionCheckpointAtRegistration as string | null | undefined) ?? null,
    selectionMode: row.selectionMode as ShockCaseSelectionMode,
    outcomeVisibilityAtSelection: row.outcomeVisibilityAtSelection as ShockOutcomeVisibilityAtSelection,
    selectionReason: row.selectionReason,
    notes: (row.notes as string | null | undefined) ?? null,
  };

  if (record.selectionMode === "prospective_pre_outcome") {
    if (record.outcomeVisibilityAtSelection !== "not_observed") {
      throw new Error(`${path}: prospective_pre_outcome requires outcomeVisibilityAtSelection=not_observed`);
    }
    if (!record.decisionCheckpointAtRegistration) {
      throw new Error(`${path}: prospective_pre_outcome requires decisionCheckpointAtRegistration`);
    }
    if (record.registeredAt > record.decisionCheckpointAtRegistration) {
      throw new Error(`${path}: prospective registration must be no later than decisionCheckpointAtRegistration`);
    }
  }
  if (record.selectionMode === "retrospective_research" && record.outcomeVisibilityAtSelection === "not_observed") {
    throw new Error(`${path}: retrospective_research cannot claim not_observed outcome visibility`);
  }
  return record;
}

function validateSelectionFile(raw: unknown, path: string): SelectionFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${path}: selection envelope is required`);
  const file = raw as SelectionFile;
  if (file.version !== SHOCK_CASE_SELECTION_VERSION) throw new Error(`${path}: version must be ${SHOCK_CASE_SELECTION_VERSION}`);
  if (!isDate(file.generatedAt)) throw new Error(`${path}: generatedAt must be YYYY-MM-DD`);
  if (!file.cases || typeof file.cases !== "object" || Array.isArray(file.cases)) throw new Error(`${path}: cases object is required`);
  return file;
}

function defaultSelectionPaths(): string[] {
  const dataDir = "data";
  const expansions = existsSync(dataDir)
    ? readdirSync(dataDir)
      .filter(name => SELECTION_EXPANSION_PATTERN.test(name))
      .sort()
      .map(name => join(dataDir, name))
    : [];
  return [DEFAULT_PATH, ...expansions].filter(existsSync);
}

export function loadShockCaseSelection(path?: string): Map<string, ShockCaseSelectionRecord> {
  const paths = path ? [path] : defaultSelectionPaths();
  const result = new Map<string, ShockCaseSelectionRecord>();

  for (const currentPath of paths) {
    const raw = validateSelectionFile(load(readFileSync(currentPath, "utf-8")), currentPath);
    for (const [id, value] of Object.entries(raw.cases)) {
      if (!id.trim()) throw new Error(`${currentPath}: empty case id`);
      if (result.has(id)) throw new Error(`duplicate shock case selection id: ${id}`);
      result.set(id, validateShockCaseSelectionRecord(value, `${currentPath}.cases.${id}`));
    }
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

  const prospectiveClaim = record.selectionMode === "prospective_pre_outcome"
    && record.outcomeVisibilityAtSelection === "not_observed";
  const frozenCheckpoint = record.decisionCheckpointAtRegistration ?? null;
  const suppliedCheckpoint = prospectiveClaim && isDate(decisionCheckpoint) ? decisionCheckpoint : null;
  const repositoryCheckpoint = prospectiveClaim
    ? (suppliedCheckpoint ?? knownHistoricalCheckpoint(caseId))
    : null;
  const frozenCheckpointValid = isDate(frozenCheckpoint);
  const checkpointMatches = repositoryCheckpoint == null || (frozenCheckpointValid && frozenCheckpoint === repositoryCheckpoint);
  const registrationTimingVerified = prospectiveClaim
    && frozenCheckpointValid
    && record.registeredAt <= frozenCheckpoint
    && checkpointMatches;
  const validationHoldoutEligible = prospectiveClaim && registrationTimingVerified;

  let reason: string;
  if (validationHoldoutEligible) {
    reason = repositoryCheckpoint
      ? "case was registered no later than its frozen decision checkpoint and the frozen checkpoint matches the repository case"
      : "case was registered no later than its frozen decision checkpoint while the evaluated outcome was not observed";
  } else if (prospectiveClaim && !frozenCheckpointValid) {
    reason = "prospective claim has no valid frozen decision checkpoint; fail closed as research-only";
  } else if (prospectiveClaim && repositoryCheckpoint && frozenCheckpoint !== repositoryCheckpoint) {
    reason = `prospective frozen checkpoint ${frozenCheckpoint} does not match repository case checkpoint ${repositoryCheckpoint}; fail closed as research-only`;
  } else if (prospectiveClaim && record.registeredAt > (frozenCheckpoint ?? "")) {
    reason = `prospective registration ${record.registeredAt} is after frozen decision checkpoint ${frozenCheckpoint}; fail closed as research-only`;
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
