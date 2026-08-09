import { createHash } from "node:crypto";
import { addDaysJst } from "../date.js";
import {
  assertEdinetDocumentTypeAllowed,
  type EdinetIssuerBoundary,
} from "../research/edinet-issuer-boundary.js";
import { parseExplicitIso8601Instant } from "../research/iso-instant.js";
import {
  EdinetApiError,
  fetchEdinetDocList,
  isEdinetCredentialsMissingError,
  type EdinetClientOptions,
  type EdinetDoc,
} from "./edinet.js";
import {
  buildEdinetDocumentLineage,
  type EdinetLineageResult,
} from "./edinet-lineage.js";
import {
  documentTypePlan,
  type SanrioEdinetDocumentTypePlan,
} from "./edinet-sanrio-pilot.js";

const HASH_RE = /^[a-f0-9]{64}$/;

type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetFailure = {
  date: string;
  code: string;
};

export type ConfiguredEdinetCandidate = {
  doc: EdinetDoc;
  reviewPriority: "high" | "normal";
  reviewReasons: string[];
  retrievableByLegalStatus: boolean;
  documentTypePlan: SanrioEdinetDocumentTypePlan[];
};

export type ConfiguredEdinetInventory = {
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
  range: {
    from: string;
    to: string;
  };
  generatedAt: string;
  scannedBusinessDays: number;
  completeness: "complete" | "partial";
  failedDates: ConfiguredEdinetFailure[];
  candidates: ConfiguredEdinetCandidate[];
  lineage: EdinetLineageResult;
  factPromotionPolicy: "human_review_required";
  requireOfficialPdfVisualReview: true;
  appendAuthorized: false;
  inventoryHash: string;
};

export type ConfiguredEdinetScanProgress = {
  date: string;
  status: "ok" | "failed";
  matched: number;
  failureCode?: string;
};

export type ConfiguredEdinetScanOptions = EdinetClientOptions & {
  boundary: EdinetIssuerBoundary;
  registryHash: string;
  interRequestDelayMs?: number;
  now?: () => Date;
  onProgress?: (progress: ConfiguredEdinetScanProgress) => void;
};

function normalizedText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid calendar date`);
  }
}

export function enumerateConfiguredEdinetBusinessDates(from: string, to: string): string[] {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (from > to) throw new Error("from must be on or before to");
  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    const weekday = new Date(`${current}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(current);
    current = addDaysJst(current, 1);
  }
  return dates;
}

export function isConfiguredIssuerPrimaryDisclosure(
  doc: EdinetDoc,
  boundary: EdinetIssuerBoundary,
): boolean {
  const edinetCode = normalizedText(doc.edinetCode).toUpperCase();
  const secCode = normalizedText(doc.secCode);
  if (!edinetCode && !secCode) return false;
  if (edinetCode && edinetCode !== boundary.edinetCode) return false;
  if (secCode && secCode !== boundary.secCode) return false;
  return true;
}

function flagIsActive(value: unknown): boolean {
  const normalized = normalizedText(value).toLowerCase();
  return normalized !== ""
    && normalized !== "0"
    && normalized !== "false"
    && normalized !== "none";
}

function reviewReasons(doc: EdinetDoc): string[] {
  const reasons: string[] = [];
  if (normalizedText(doc.parentDocID)) reasons.push("parent_document_link");
  if (/訂正|修正|差替|再提出/.test(
    `${normalizedText(doc.docDescription)} ${normalizedText(doc.currentReportReason)}`,
  )) {
    reasons.push("correction_like_text");
  }
  if (flagIsActive(doc.withdrawalStatus)) reasons.push("withdrawal_status_active");
  if (flagIsActive(doc.docInfoEditStatus)) reasons.push("document_info_edit_status_active");
  if (flagIsActive(doc.disclosureStatus)) reasons.push("disclosure_status_active");
  if (!["1", "2"].includes(normalizedText(doc.legalStatus))) {
    reasons.push("outside_retrievable_legal_status");
  }
  return [...new Set(reasons)].sort();
}

function preferLatest(left: EdinetDoc, right: EdinetDoc): EdinetDoc {
  const leftKey = `${normalizedText(left.opeDateTime)}|${normalizedText(left.submitDateTime)}|${left.seqNumber}`;
  const rightKey = `${normalizedText(right.opeDateTime)}|${normalizedText(right.submitDateTime)}|${right.seqNumber}`;
  return rightKey > leftKey ? right : left;
}

function dedupeDocuments(docs: EdinetDoc[]): EdinetDoc[] {
  const byId = new Map<string, EdinetDoc>();
  for (const doc of docs) {
    const docID = normalizedText(doc.docID);
    if (!docID) continue;
    const existing = byId.get(docID);
    byId.set(docID, existing ? preferLatest(existing, doc) : doc);
  }
  return [...byId.values()].sort((left, right) =>
    `${normalizedText(left.submitDateTime)}|${normalizedText(left.docID)}`.localeCompare(
      `${normalizedText(right.submitDateTime)}|${normalizedText(right.docID)}`,
    ),
  );
}

function allowedDocumentTypePlan(
  doc: EdinetDoc,
  boundary: EdinetIssuerBoundary,
): SanrioEdinetDocumentTypePlan[] {
  const plan = documentTypePlan(doc).filter(item => boundary.allowedDocumentTypes.includes(item.type));
  for (const item of plan) assertEdinetDocumentTypeAllowed(boundary, item.type);
  return plan;
}

function assertBoundary(boundary: EdinetIssuerBoundary, registryHash: string): void {
  if (!boundary.active) throw new Error(`issuer is inactive: ${boundary.issuerKey}`);
  if (!HASH_RE.test(boundary.boundaryHash)) throw new Error("issuer boundaryHash is invalid");
  if (!HASH_RE.test(registryHash)) throw new Error("registryHash is invalid");
  if (boundary.factPromotionPolicy !== "human_review_required") {
    throw new Error("configured inventory requires human_review_required fact policy");
  }
  if (boundary.requireOfficialPdfVisualReview !== true) {
    throw new Error("configured inventory requires official PDF visual review");
  }
  if (!boundary.allowedDocumentTypes.includes("1")) {
    throw new Error("configured inventory requires document type 1 for structured review");
  }
}

export function buildConfiguredEdinetInventory(input: {
  boundary: EdinetIssuerBoundary;
  registryHash: string;
  from: string;
  to: string;
  generatedAt: string;
  scannedBusinessDays: number;
  failedDates: ConfiguredEdinetFailure[];
  docs: EdinetDoc[];
}): ConfiguredEdinetInventory {
  assertBoundary(input.boundary, input.registryHash);
  assertIsoDate(input.from, "from");
  assertIsoDate(input.to, "to");
  if (input.from > input.to) throw new Error("from must be on or before to");
  parseExplicitIso8601Instant(input.generatedAt, "generatedAt");
  if (!Number.isSafeInteger(input.scannedBusinessDays) || input.scannedBusinessDays < 0) {
    throw new Error("scannedBusinessDays must be a non-negative integer");
  }
  const expectedBusinessDays = enumerateConfiguredEdinetBusinessDates(input.from, input.to).length;
  if (input.scannedBusinessDays !== expectedBusinessDays) {
    throw new Error(`scannedBusinessDays must match configured range business days: expected ${expectedBusinessDays}`);
  }
  const docs = dedupeDocuments(
    input.docs.filter(doc => isConfiguredIssuerPrimaryDisclosure(doc, input.boundary)),
  );
  const candidates = docs.map((doc): ConfiguredEdinetCandidate => {
    const reasons = reviewReasons(doc);
    return {
      doc,
      reviewPriority: reasons.length > 0 ? "high" : "normal",
      reviewReasons: reasons,
      retrievableByLegalStatus: ["1", "2"].includes(normalizedText(doc.legalStatus)),
      documentTypePlan: allowedDocumentTypePlan(doc, input.boundary),
    };
  });
  const hashBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: input.registryHash,
    issuer: {
      issuerKey: input.boundary.issuerKey,
      name: input.boundary.name,
      edinetCode: input.boundary.edinetCode,
      secCode: input.boundary.secCode,
      boundaryHash: input.boundary.boundaryHash,
    },
    range: { from: input.from, to: input.to },
    generatedAt: input.generatedAt,
    scannedBusinessDays: input.scannedBusinessDays,
    completeness: input.failedDates.length === 0 ? "complete" as const : "partial" as const,
    failedDates: [...input.failedDates].sort((left, right) => left.date.localeCompare(right.date)),
    candidates,
    lineage: buildEdinetDocumentLineage(docs),
    factPromotionPolicy: "human_review_required" as const,
    requireOfficialPdfVisualReview: true as const,
    appendAuthorized: false as const,
  };
  return { ...hashBase, inventoryHash: digest(hashBase) };
}

function failureCode(error: unknown): string {
  if (error instanceof EdinetApiError) {
    return error.status === 0 ? "network_error" : `http_${error.status}`;
  }
  return "unexpected_error";
}

export async function scanConfiguredEdinetRange(
  from: string,
  to: string,
  options: ConfiguredEdinetScanOptions,
): Promise<ConfiguredEdinetInventory> {
  assertBoundary(options.boundary, options.registryHash);
  const dates = enumerateConfiguredEdinetBusinessDates(from, to);
  const docs: EdinetDoc[] = [];
  const failedDates: ConfiguredEdinetFailure[] = [];
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const delayMs = Math.max(0, options.interRequestDelayMs ?? 300);
  if (!Number.isFinite(delayMs) || delayMs > 60_000) throw new Error("interRequestDelayMs is invalid");

  for (let index = 0; index < dates.length; index++) {
    const date = dates[index]!;
    try {
      const daily = await fetchEdinetDocList(date, options);
      const matched = daily.filter(doc => isConfiguredIssuerPrimaryDisclosure(doc, options.boundary));
      docs.push(...matched);
      options.onProgress?.({ date, status: "ok", matched: matched.length });
    } catch (error) {
      if (isEdinetCredentialsMissingError(error)) throw error;
      const code = failureCode(error);
      failedDates.push({ date, code });
      options.onProgress?.({ date, status: "failed", matched: 0, failureCode: code });
    }
    if (index < dates.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  return buildConfiguredEdinetInventory({
    boundary: options.boundary,
    registryHash: options.registryHash,
    from,
    to,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    scannedBusinessDays: dates.length,
    failedDates,
    docs,
  });
}