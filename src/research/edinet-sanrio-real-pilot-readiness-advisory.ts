import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import {
  assertSanrioConfiguredAdvisoryIntegrity,
} from "./edinet-sanrio-configured-advisory-integrity.js";
import {
  inspectSanrioRealPilotPreflightWithIntegrity,
} from "./edinet-sanrio-real-pilot-integrity.js";
import {
  renderSanrioRealPilotPreflight,
  type SanrioRealPilotPreflightResult,
} from "./edinet-sanrio-real-pilot-preflight.js";

const MAX_JSON_BYTES = 30 * 1024 * 1024;
const HASH_RE = /^[a-f0-9]{64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_INVENTORY_RE = /^sanrio-edinet-inventory\.legacy\.[A-Za-z0-9_-]+\.json$/;
const CONFIGURED_INVENTORY_RE = /^sanrio-edinet-inventory\.configured\.[A-Za-z0-9_-]+\.json$/;

type JsonObject = Record<string, unknown>;

type InventoryCandidate = {
  path: string;
  basename: string;
  mtimeMs: number;
  record: JsonObject;
  rangeFrom: string;
  rangeTo: string;
  scannedBusinessDays: number;
};

export type SanrioRealPilotPreflightWithReadinessAdvisory = SanrioRealPilotPreflightResult & {
  readOnlyFollowUpCommand: string | null;
  readOnlyFollowUpPurpose: "foundation_readiness_evidence_gap_audit" | null;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function isHash(value: unknown): boolean {
  return HASH_RE.test(text(value));
}

function isGregorianDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function inventoryShape(record: JsonObject): { rangeFrom: string; rangeTo: string; scannedBusinessDays: number } | null {
  const issuer = object(record.issuer);
  const range = object(record.range);
  const rangeFrom = text(range?.from);
  const rangeTo = text(range?.to);
  const scannedBusinessDays = Number(record.scannedBusinessDays);
  if (
    record.schemaVersion !== 1
    || record.source !== "edinet"
    || text(issuer?.edinetCode) !== "E02655"
    || text(issuer?.secCode) !== "81360"
    || record.completeness !== "complete"
    || record.appendAuthorized !== false
    || !isGregorianDate(rangeFrom)
    || !isGregorianDate(rangeTo)
    || rangeFrom > rangeTo
    || !Number.isSafeInteger(scannedBusinessDays)
    || scannedBusinessDays < 0
    || !Array.isArray(record.failedDates)
    || record.failedDates.length !== 0
    || !Array.isArray(record.candidates)
  ) return null;
  return { rangeFrom, rangeTo, scannedBusinessDays };
}

function readInventoryCandidate(
  root: string,
  filename: string,
  kind: "legacy" | "configured",
): InventoryCandidate | null {
  try {
    const path = resolve(root, filename);
    const rel = relative(root, path);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(sep)) return null;
    const linkStat = lstatSync(path);
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) return null;
    const fileStat = statSync(path);
    if (fileStat.size <= 0 || fileStat.size > MAX_JSON_BYTES) return null;
    const record = object(JSON.parse(readFileSync(path, "utf-8")) as unknown);
    if (!record) return null;
    const shape = inventoryShape(record);
    if (!shape) return null;
    const issuer = object(record.issuer);
    if (kind === "configured") {
      if (
        text(issuer?.issuerKey) !== "sanrio"
        || !isHash(issuer?.boundaryHash)
        || !isHash(record.registryHash)
        || !isHash(record.inventoryHash)
        || record.factPromotionPolicy !== "human_review_required"
        || record.requireOfficialPdfVisualReview !== true
      ) return null;
    } else if ("issuerKey" in (issuer ?? {})) {
      return null;
    }
    return {
      path,
      basename: filename,
      mtimeMs: fileStat.mtimeMs,
      record,
      ...shape,
    };
  } catch {
    return null;
  }
}

function matchingInventoryPair(root: string): { legacy: InventoryCandidate; configured: InventoryCandidate } | null {
  let entries: string[];
  try {
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return null;
    entries = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  } catch {
    return null;
  }
  const legacy = entries
    .filter(name => LEGACY_INVENTORY_RE.test(name))
    .map(name => readInventoryCandidate(root, name, "legacy"))
    .filter((candidate): candidate is InventoryCandidate => candidate !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.basename.localeCompare(left.basename));
  const configured = entries
    .filter(name => CONFIGURED_INVENTORY_RE.test(name))
    .map(name => readInventoryCandidate(root, name, "configured"))
    .filter((candidate): candidate is InventoryCandidate => candidate !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.basename.localeCompare(left.basename));

  const pairs = configured.flatMap(configuredCandidate => legacy
    .filter(legacyCandidate =>
      legacyCandidate.rangeFrom === configuredCandidate.rangeFrom
      && legacyCandidate.rangeTo === configuredCandidate.rangeTo
      && legacyCandidate.scannedBusinessDays === configuredCandidate.scannedBusinessDays,
    )
    .map(legacyCandidate => ({ legacy: legacyCandidate, configured: configuredCandidate })));

  return pairs.sort((left, right) => {
    const leftMtime = Math.max(left.legacy.mtimeMs, left.configured.mtimeMs);
    const rightMtime = Math.max(right.legacy.mtimeMs, right.configured.mtimeMs);
    return rightMtime - leftMtime
      || right.configured.basename.localeCompare(left.configured.basename)
      || right.legacy.basename.localeCompare(left.legacy.basename);
  })[0] ?? null;
}

export function addSanrioInventoryCompatibilityAdvisory(
  result: SanrioRealPilotPreflightResult,
  edinetRoot: string,
): SanrioRealPilotPreflightResult {
  if (
    result.stage !== "parity_inputs_required"
    || result.selectedFiles.inventoryAudit
    || !result.missingInputs.includes("green sanrio-edinet-inventory-compatibility-v1.*.json")
  ) return result;

  const pair = matchingInventoryPair(resolve(edinetRoot));
  if (!pair) return result;
  return {
    ...result,
    requiresHumanAction: false,
    nextCommand: [
      "bash scripts/audit-edinet-inventory-compatibility-local.sh \\",
      `  --legacy ${shellQuote(`data/edinet/${basename(pair.legacy.path)}`)} \\`,
      `  --configured ${shellQuote(`data/edinet/${basename(pair.configured.path)}`)}`,
    ].join("\n"),
  };
}

export function addSanrioFoundationReadinessAdvisory(
  result: SanrioRealPilotPreflightResult,
): SanrioRealPilotPreflightWithReadinessAdvisory {
  if (
    result.stage !== "parity_complete_foundation_gate_pending"
    || !result.selectedFiles.parityReviewRecord
  ) {
    return {
      ...result,
      readOnlyFollowUpCommand: null,
      readOnlyFollowUpPurpose: null,
    };
  }
  const parityReview = `data/edinet/${result.selectedFiles.parityReviewRecord}`;
  return {
    ...result,
    nextCommand: null,
    readOnlyFollowUpPurpose: "foundation_readiness_evidence_gap_audit",
    readOnlyFollowUpCommand: [
      "bash scripts/run-sanrio-configured-foundation-readiness-audit-local.sh \\",
      `  --parity-review ${shellQuote(parityReview)} \\`,
      "  --execute-readiness-audit",
    ].join("\n"),
  };
}

export function inspectSanrioRealPilotPreflightWithReadinessAdvisory(
  edinetRoot = resolve(process.cwd(), "data/edinet"),
): SanrioRealPilotPreflightWithReadinessAdvisory {
  const result = inspectSanrioRealPilotPreflightWithIntegrity(edinetRoot);
  if (result.stage !== "missing_edinet_root") {
    assertSanrioConfiguredAdvisoryIntegrity(result, edinetRoot);
  }
  return addSanrioFoundationReadinessAdvisory(
    addSanrioInventoryCompatibilityAdvisory(result, edinetRoot),
  );
}

export function renderSanrioRealPilotPreflightWithReadinessAdvisory(
  result: SanrioRealPilotPreflightWithReadinessAdvisory,
): string {
  const base = renderSanrioRealPilotPreflight(result).trimEnd();
  if (!result.readOnlyFollowUpCommand) return `${base}\n`;
  return `${base}\nreadOnlyFollowUpPurpose: ${result.readOnlyFollowUpPurpose}\nreadOnlyFollowUpCommand:\n${result.readOnlyFollowUpCommand}\nfoundationGateStillPending: true\n`;
}
