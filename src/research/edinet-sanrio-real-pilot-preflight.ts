import {
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { isSanrioLegacyHumanReviewFilename } from "./edinet-sanrio-parity-local-paths.js";

const MAX_JSON_BYTES = 30 * 1024 * 1024;
const ACQUISITION_DIR_RE = /^sanrio-acquisition\.[A-Za-z0-9_-]+$/;
const FIDELITY_RE = /^revision-source-fidelity-v1\.[A-Za-z0-9_-]+\.json$/;
const INSPECTION_RE = /^revision-unmatched-anchor-inspection-v1\.[A-Za-z0-9_-]+\.json$/;
const HUMAN_INPUT_RE = /^revision-human-review-input-v1\.[A-Za-z0-9_-]+\.json$/;
const CONFIGURED_EXACT_COMPARISON_RE = /^configured-fidelity-exact-comparison-v1\.[A-Za-z0-9_-]+\.json$/;
const CONFIGURED_HUMAN_INPUT_RE = /^configured-human-comparison-input-v1\.[A-Za-z0-9_-]+\.json$/;
const CONFIGURED_REVIEW_RE = /^configured-human-comparison-record-v1\.[A-Za-z0-9_-]+\.json$/;
const INVENTORY_AUDIT_RE = /^sanrio-edinet-inventory-compatibility-v1\.[A-Za-z0-9_-]+\.json$/;
const PARITY_WORKSPACE_RE = /^legacy-configured-parity-workspace-v1\.[A-Za-z0-9_-]+\.json$/;
const PARITY_INPUT_RE = /^legacy-configured-parity-review-input-v1\.[A-Za-z0-9_-]+\.json$/;
const PARITY_RECORD_RE = /^legacy-configured-parity-review-record-v1\.[A-Za-z0-9_-]+\.json$/;

type JsonObject = Record<string, unknown>;

type LocalJson = {
  path: string;
  relativePath: string;
  basename: string;
  mtimeMs: number;
  record: JsonObject;
};

export type SanrioRealPilotPreflightStage =
  | "missing_edinet_root"
  | "inspection_required"
  | "human_review_template_required"
  | "human_review_finalize_required"
  | "parity_inputs_required"
  | "parity_workspace_required"
  | "parity_human_template_required"
  | "parity_human_finalize_required"
  | "parity_complete_foundation_gate_pending";

export type SanrioRealPilotPreflightResult = {
  schemaVersion: 1;
  root: string;
  stage: SanrioRealPilotPreflightStage;
  nextCommand: string | null;
  requiresHumanAction: boolean;
  missingInputs: string[];
  selectedFiles: {
    fidelity?: string;
    inspection?: string;
    humanReviewInput?: string;
    humanReviewDecision?: string;
    inventoryAudit?: string;
    configuredComparison?: string;
    configuredHumanReviewInput?: string;
    configuredReview?: string;
    parityWorkspace?: string;
    parityReviewInput?: string;
    parityReviewRecord?: string;
  };
  warnings: string[];
  safety: {
    rawContentPrinted: false;
    automaticReplacementAuthorized: false;
    foundationAppendAuthorized: false;
    automaticTradingAuthorized: false;
  };
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !resolve(path).startsWith(`${resolve(root)}${sep}..${sep}`);
}

function safeRelative(root: string, path: string): string {
  const rel = relative(root, path).replace(/\\/g, "/");
  if (!rel || rel === ".." || rel.startsWith("../") || rel.includes("/../")) {
    throw new Error(`path escaped EDINET root: ${basename(path)}`);
  }
  return rel;
}

function readJsonCandidate(root: string, path: string, warnings: string[]): LocalJson | null {
  try {
    if (!inside(root, path)) throw new Error("outside EDINET root");
    const linkStat = lstatSync(path);
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) throw new Error("not a regular non-symlink file");
    const fileStat = statSync(path);
    if (fileStat.size <= 0 || fileStat.size > MAX_JSON_BYTES) throw new Error("invalid file size");
    const record = object(JSON.parse(readFileSync(path, "utf-8")) as unknown);
    if (!record) throw new Error("JSON root is not an object");
    return {
      path,
      relativePath: safeRelative(root, path),
      basename: basename(path),
      mtimeMs: fileStat.mtimeMs,
      record,
    };
  } catch (error) {
    warnings.push(`${safeWarningPath(root, path)}: ${error instanceof Error ? error.message : "invalid JSON"}`);
    return null;
  }
}

function safeWarningPath(root: string, path: string): string {
  try {
    const rel = relative(root, path).replace(/\\/g, "/");
    return rel && !rel.startsWith("../") ? rel : basename(path);
  } catch {
    return basename(path);
  }
}

function newest(records: LocalJson[]): LocalJson | null {
  return [...records].sort((left, right) =>
    right.mtimeMs - left.mtimeMs || right.relativePath.localeCompare(left.relativePath),
  )[0] ?? null;
}

function listAcquisitionFiles(root: string, pattern: RegExp, warnings: string[]): LocalJson[] {
  const result: LocalJson[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ACQUISITION_DIR_RE.test(entry.name)) continue;
    const directory = resolve(root, entry.name);
    const directoryStat = lstatSync(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) continue;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile() || !pattern.test(file.name)) continue;
      const candidate = readJsonCandidate(root, resolve(directory, file.name), warnings);
      if (candidate) result.push(candidate);
    }
  }
  return result;
}

function listLegacyDecisionFiles(root: string, warnings: string[]): LocalJson[] {
  const result: LocalJson[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ACQUISITION_DIR_RE.test(entry.name)) continue;
    const directory = resolve(root, entry.name);
    if (lstatSync(directory).isSymbolicLink()) continue;
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (!file.isFile() || !isSanrioLegacyHumanReviewFilename(file.name)) continue;
      const candidate = readJsonCandidate(root, resolve(directory, file.name), warnings);
      if (candidate) result.push(candidate);
    }
  }
  return result;
}

function listRootFiles(root: string, pattern: RegExp, warnings: string[]): LocalJson[] {
  const result: LocalJson[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    const candidate = readJsonCandidate(root, resolve(root, entry.name), warnings);
    if (candidate) result.push(candidate);
  }
  return result;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function command(script: string, args: Array<[string, string]>): string {
  const pieces = [`bash ${script}`];
  for (const [name, value] of args) pieces.push(`  --${name} ${shellQuote(value)}`);
  return pieces.join(" \\\n");
}

function selectedBase(root: string): SanrioRealPilotPreflightResult {
  return {
    schemaVersion: 1,
    root,
    stage: "inspection_required",
    nextCommand: null,
    requiresHumanAction: false,
    missingInputs: [],
    selectedFiles: {},
    warnings: [],
    safety: {
      rawContentPrinted: false,
      automaticReplacementAuthorized: false,
      foundationAppendAuthorized: false,
      automaticTradingAuthorized: false,
    },
  };
}

function usableFidelity(records: LocalJson[]): LocalJson | null {
  return newest(records.filter((candidate) =>
    candidate.record.schemaVersion === 1
    && candidate.record.source === "edinet"
    && candidate.record.reviewStatus === "pending_human_review"
    && candidate.record.appendAuthorized === false,
  ));
}

function finalizedLegacyForInspection(records: LocalJson[], inspection: LocalJson): LocalJson | null {
  const sameInspection = records.filter((candidate) =>
    dirname(candidate.path) === dirname(inspection.path)
    && text(candidate.record.sourceInspectionFile) === inspection.basename
    && candidate.record.reviewStatus === "complete_human_review"
    && candidate.record.appendAuthorized === false,
  );
  const canonical = sameInspection.filter((candidate) => candidate.basename.startsWith("revision-human-review-decision-v1."));
  return newest(canonical) ?? newest(sameInspection);
}

function draftInputForInspection(records: LocalJson[], inspection: LocalJson): LocalJson | null {
  return newest(records.filter((candidate) =>
    dirname(candidate.path) === dirname(inspection.path)
    && text(candidate.record.sourceInspectionFile) === inspection.basename
    && candidate.record.reviewStatus === "draft_human_input"
    && candidate.record.appendAuthorized === false,
  ));
}

function greenInventory(records: LocalJson[]): LocalJson | null {
  return newest(records.filter((candidate) =>
    candidate.record.schemaVersion === 1
    && candidate.record.source === "edinet"
    && candidate.record.migrationReadyForHumanReview === true
    && candidate.record.replacementAuthorized === false
    && candidate.record.appendAuthorized === false,
  ));
}

function completedConfiguredReview(records: LocalJson[]): LocalJson | null {
  return newest(records.filter((candidate) =>
    candidate.record.schemaVersion === 1
    && candidate.record.source === "edinet"
    && candidate.record.reviewStatus === "complete_human_comparison_review"
    && candidate.record.appendAuthorized === false,
  ));
}

function completedConfiguredComparison(records: LocalJson[]): LocalJson | null {
  return newest(records.filter((candidate) => {
    const issuer = object(candidate.record.issuer);
    return candidate.record.schemaVersion === 1
      && candidate.record.source === "edinet"
      && text(issuer?.issuerKey) === "sanrio"
      && candidate.record.comparisonStatus === "complete_exact_normalized_comparison"
      && candidate.record.reviewStatus === "pending_human_comparison_review"
      && candidate.record.fuzzyMatchingUsed === false
      && candidate.record.semanticEquivalenceInferred === false
      && candidate.record.officialPdfVisualReviewComplete === false
      && candidate.record.foundationPreviewEligible === false
      && candidate.record.appendAuthorized === false;
  }));
}

function draftConfiguredInputForComparison(records: LocalJson[], comparison: LocalJson): LocalJson | null {
  return newest(records.filter((candidate) =>
    dirname(candidate.path) === dirname(comparison.path)
    && text(candidate.record.sourceComparisonFile) === comparison.basename
    && candidate.record.reviewStatus === "draft_human_input"
    && candidate.record.foundationPreviewEligible === false
    && candidate.record.appendAuthorized === false,
  ));
}

function workspaceForInputs(
  records: LocalJson[],
  inventory: LocalJson,
  legacy: LocalJson,
  configured: LocalJson,
): LocalJson | null {
  return newest(records.filter((candidate) =>
    candidate.record.schemaVersion === 1
    && candidate.record.machineStatus === "parity_workspace_ready_for_human_mapping"
    && text(candidate.record.sourceInventoryAuditFile) === inventory.basename
    && text(candidate.record.sourceLegacyReviewPath) === legacy.relativePath
    && text(candidate.record.sourceConfiguredReviewPath) === configured.relativePath
    && candidate.record.replacementAuthorized === false
    && candidate.record.appendAuthorized === false,
  ));
}

function parityInputForWorkspace(records: LocalJson[], workspace: LocalJson): LocalJson | null {
  return newest(records.filter((candidate) =>
    dirname(candidate.path) === dirname(workspace.path)
    && text(candidate.record.sourceWorkspaceFile) === workspace.basename
    && candidate.record.reviewStatus === "draft_human_input"
    && candidate.record.appendAuthorized === false,
  ));
}

function parityRecordForWorkspace(records: LocalJson[], workspace: LocalJson): LocalJson | null {
  return newest(records.filter((candidate) =>
    dirname(candidate.path) === dirname(workspace.path)
    && text(candidate.record.sourceWorkspaceFile) === workspace.basename
    && candidate.record.reviewStatus === "complete_human_parity_review"
    && candidate.record.replacementAuthorized === false
    && candidate.record.appendAuthorized === false,
  ));
}

export function inspectSanrioRealPilotPreflight(
  edinetRoot = resolve(process.cwd(), "data/edinet"),
): SanrioRealPilotPreflightResult {
  const root = resolve(edinetRoot);
  const result = selectedBase(root);

  try {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("data/edinet is not a regular directory");
  } catch {
    return { ...result, stage: "missing_edinet_root", missingInputs: ["data/edinet local root"] };
  }

  const warnings: string[] = [];
  const inspections = listAcquisitionFiles(root, INSPECTION_RE, warnings).filter((candidate) =>
    candidate.record.reviewStatus === "pending_human_review"
    && candidate.record.appendAuthorized === false,
  );
  const inspection = newest(inspections);
  if (!inspection) {
    const fidelity = usableFidelity(listAcquisitionFiles(root, FIDELITY_RE, warnings));
    if (!fidelity) {
      return {
        ...result,
        stage: "inspection_required",
        nextCommand: null,
        missingInputs: ["revision-source-fidelity-v1.*.json"],
        warnings,
      };
    }
    result.selectedFiles.fidelity = fidelity.relativePath;
    return {
      ...result,
      stage: "inspection_required",
      nextCommand: command("scripts/run-sanrio-edinet-unmatched-anchor-inspection-local.sh", [[
        "fidelity",
        `data/edinet/${fidelity.relativePath}`,
      ]]),
      missingInputs: ["revision-unmatched-anchor-inspection-v1.*.json"],
      selectedFiles: { ...result.selectedFiles },
      warnings,
    };
  }
  result.selectedFiles.inspection = inspection.relativePath;

  const humanInputs = listAcquisitionFiles(root, HUMAN_INPUT_RE, warnings);
  const legacyDecisions = listLegacyDecisionFiles(root, warnings);
  const humanDecision = finalizedLegacyForInspection(legacyDecisions, inspection);
  if (!humanDecision) {
    const humanInput = draftInputForInspection(humanInputs, inspection);
    if (!humanInput) {
      return {
        ...result,
        stage: "human_review_template_required",
        requiresHumanAction: true,
        nextCommand: command("scripts/run-sanrio-edinet-human-review-decision-local.sh", [["inspection", `data/edinet/${inspection.relativePath}`]]),
        selectedFiles: { ...result.selectedFiles },
        warnings,
      };
    }
    result.selectedFiles.humanReviewInput = humanInput.relativePath;
    return {
      ...result,
      stage: "human_review_finalize_required",
      requiresHumanAction: true,
      nextCommand: command("scripts/run-sanrio-edinet-human-review-decision-local.sh", [["finalize", `data/edinet/${humanInput.relativePath}`]]),
      selectedFiles: { ...result.selectedFiles },
      warnings,
    };
  }
  result.selectedFiles.humanReviewDecision = humanDecision.relativePath;

  const inventory = greenInventory(listRootFiles(root, INVENTORY_AUDIT_RE, warnings));
  const configured = completedConfiguredReview(listAcquisitionFiles(root, CONFIGURED_REVIEW_RE, warnings));
  const missingInputs: string[] = [];
  if (!inventory) missingInputs.push("green sanrio-edinet-inventory-compatibility-v1.*.json");
  if (!configured) missingInputs.push("complete configured-human-comparison-record-v1.*.json");
  if (inventory) result.selectedFiles.inventoryAudit = inventory.relativePath;
  if (configured) result.selectedFiles.configuredReview = configured.relativePath;
  if (!inventory || !configured) {
    let nextCommand: string | null = null;
    let requiresHumanAction = false;
    if (!configured) {
      const configuredComparison = completedConfiguredComparison(
        listAcquisitionFiles(root, CONFIGURED_EXACT_COMPARISON_RE, warnings),
      );
      if (configuredComparison) {
        result.selectedFiles.configuredComparison = configuredComparison.relativePath;
        const configuredInput = draftConfiguredInputForComparison(
          listAcquisitionFiles(root, CONFIGURED_HUMAN_INPUT_RE, warnings),
          configuredComparison,
        );
        requiresHumanAction = true;
        if (configuredInput) {
          result.selectedFiles.configuredHumanReviewInput = configuredInput.relativePath;
          nextCommand = command("scripts/run-configured-edinet-human-comparison-review-local.sh", [[
            "finalize",
            `data/edinet/${configuredInput.relativePath}`,
          ]]);
        } else {
          nextCommand = command("scripts/run-configured-edinet-human-comparison-review-local.sh", [[
            "comparison",
            `data/edinet/${configuredComparison.relativePath}`,
          ]]);
        }
      }
    }
    return {
      ...result,
      stage: "parity_inputs_required",
      requiresHumanAction,
      nextCommand,
      missingInputs,
      selectedFiles: { ...result.selectedFiles },
      warnings,
    };
  }

  const workspaces = listAcquisitionFiles(root, PARITY_WORKSPACE_RE, warnings);
  const workspace = workspaceForInputs(workspaces, inventory, humanDecision, configured);
  if (!workspace) {
    return {
      ...result,
      stage: "parity_workspace_required",
      requiresHumanAction: false,
      nextCommand: command("scripts/run-sanrio-configured-parity-workspace-local.sh", [
        ["inventory-audit", `data/edinet/${inventory.relativePath}`],
        ["legacy-review", `data/edinet/${humanDecision.relativePath}`],
        ["configured-review", `data/edinet/${configured.relativePath}`],
      ]),
      selectedFiles: { ...result.selectedFiles },
      warnings,
    };
  }
  result.selectedFiles.parityWorkspace = workspace.relativePath;

  const parityRecords = listAcquisitionFiles(root, PARITY_RECORD_RE, warnings);
  const parityRecord = parityRecordForWorkspace(parityRecords, workspace);
  if (parityRecord) {
    result.selectedFiles.parityReviewRecord = parityRecord.relativePath;
    return {
      ...result,
      stage: "parity_complete_foundation_gate_pending",
      requiresHumanAction: false,
      nextCommand: null,
      missingInputs: [],
      selectedFiles: { ...result.selectedFiles },
      warnings,
    };
  }

  const parityInputs = listAcquisitionFiles(root, PARITY_INPUT_RE, warnings);
  const parityInput = parityInputForWorkspace(parityInputs, workspace);
  if (!parityInput) {
    return {
      ...result,
      stage: "parity_human_template_required",
      requiresHumanAction: true,
      nextCommand: command("scripts/run-sanrio-configured-parity-human-review-local.sh", [["workspace", `data/edinet/${workspace.relativePath}`]]),
      selectedFiles: { ...result.selectedFiles },
      warnings,
    };
  }
  result.selectedFiles.parityReviewInput = parityInput.relativePath;
  return {
    ...result,
    stage: "parity_human_finalize_required",
    requiresHumanAction: true,
    nextCommand: command("scripts/run-sanrio-configured-parity-human-review-local.sh", [["finalize", `data/edinet/${parityInput.relativePath}`]]),
    selectedFiles: { ...result.selectedFiles },
    warnings,
  };
}

export function renderSanrioRealPilotPreflight(result: SanrioRealPilotPreflightResult): string {
  const lines = [
    "Sanrio real local pilot preflight",
    `stage: ${result.stage}`,
    `requiresHumanAction: ${result.requiresHumanAction}`,
  ];
  for (const [key, value] of Object.entries(result.selectedFiles)) {
    if (value) lines.push(`${key}: ${value}`);
  }
  if (result.missingInputs.length > 0) {
    lines.push("missingInputs:");
    for (const item of result.missingInputs) lines.push(`- ${item}`);
  }
  if (result.nextCommand) {
    lines.push("nextCommand:");
    lines.push(result.nextCommand);
  }
  if (result.warnings.length > 0) {
    lines.push("warnings (filenames/metadata only):");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  lines.push("rawContentPrinted: false");
  lines.push("automaticReplacementAuthorized: false");
  lines.push("foundationAppendAuthorized: false");
  lines.push("automaticTradingAuthorized: false");
  return `${lines.join("\n")}\n`;
}