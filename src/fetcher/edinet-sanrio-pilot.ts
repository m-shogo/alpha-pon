import { addDaysJst } from "../date.js";
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

export const SANRIO_EDINET_CODE = "E02655";
export const SANRIO_SEC_CODE = "81360";

export type SanrioEdinetFailure = {
  date: string;
  code: string;
};

export type SanrioEdinetDocumentTypePlan = {
  type: "1" | "2" | "3" | "4" | "5";
  label:
    | "submitted_document_and_audit_zip"
    | "pdf"
    | "attachments_zip"
    | "english_files_zip"
    | "csv_zip";
  format: "zip" | "pdf";
  reason: string;
};

export type SanrioEdinetCandidate = {
  doc: EdinetDoc;
  reviewPriority: "high" | "normal";
  reviewReasons: string[];
  retrievableByLegalStatus: boolean;
  documentTypePlan: SanrioEdinetDocumentTypePlan[];
};

export type SanrioEdinetInventory = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: typeof SANRIO_EDINET_CODE;
    secCode: typeof SANRIO_SEC_CODE;
  };
  range: {
    from: string;
    to: string;
  };
  generatedAt: string;
  scannedBusinessDays: number;
  completeness: "complete" | "partial";
  failedDates: SanrioEdinetFailure[];
  candidates: SanrioEdinetCandidate[];
  lineage: EdinetLineageResult;
  appendAuthorized: false;
};

export type SanrioEdinetScanProgress = {
  date: string;
  status: "ok" | "failed";
  matched: number;
  failureCode?: string;
};

export type SanrioEdinetScanOptions = EdinetClientOptions & {
  interRequestDelayMs?: number;
  now?: () => Date;
  onProgress?: (progress: SanrioEdinetScanProgress) => void;
};

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid calendar date`);
  }
}

export function enumerateBusinessDates(from: string, to: string): string[] {
  assertIsoDate(from, "from");
  assertIsoDate(to, "to");
  if (from > to) throw new Error("from must be on or before to");

  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    const weekday = new Date(`${current}T00:00:00+09:00`).getDay();
    if (weekday !== 0 && weekday !== 6) dates.push(current);
    current = addDaysJst(current, 1);
  }
  return dates;
}

export function isSanrioPrimaryDisclosure(doc: EdinetDoc): boolean {
  return doc.edinetCode === SANRIO_EDINET_CODE || doc.secCode === SANRIO_SEC_CODE;
}

function flagIsActive(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

function reviewReasons(doc: EdinetDoc): string[] {
  const reasons: string[] = [];
  if (doc.parentDocID.trim()) reasons.push("parent_document_link");
  if (/訂正|修正|差替|再提出/.test(`${doc.docDescription} ${doc.currentReportReason}`)) {
    reasons.push("correction_like_text");
  }
  if (flagIsActive(doc.withdrawalStatus)) reasons.push("withdrawal_status_active");
  if (flagIsActive(doc.docInfoEditStatus)) reasons.push("document_info_edit_status_active");
  if (flagIsActive(doc.disclosureStatus)) reasons.push("disclosure_status_active");
  if (!["1", "2"].includes(doc.legalStatus.trim())) reasons.push("outside_retrievable_legal_status");
  return [...new Set(reasons)].sort();
}

export function documentTypePlan(doc: EdinetDoc): SanrioEdinetDocumentTypePlan[] {
  const plan: SanrioEdinetDocumentTypePlan[] = [];
  if (["1", "2"].includes(doc.legalStatus.trim())) {
    plan.push({
      type: "1",
      label: "submitted_document_and_audit_zip",
      format: "zip",
      reason: "official EDINET API v2 submitted-document package",
    });
    if (doc.pdfFlag === "1") {
      plan.push({
        type: "2",
        label: "pdf",
        format: "pdf",
        reason: "pdfFlag=1",
      });
    }
    if (doc.attachDocFlag === "1") {
      plan.push({
        type: "3",
        label: "attachments_zip",
        format: "zip",
        reason: "attachDocFlag=1",
      });
    }
    if (doc.englishDocFlag === "1") {
      plan.push({
        type: "4",
        label: "english_files_zip",
        format: "zip",
        reason: "englishDocFlag=1",
      });
    }
    if (doc.csvFlag === "1") {
      plan.push({
        type: "5",
        label: "csv_zip",
        format: "zip",
        reason: "csvFlag=1",
      });
    }
  }
  return plan;
}

function preferLatest(left: EdinetDoc, right: EdinetDoc): EdinetDoc {
  const leftKey = `${left.opeDateTime}|${left.submitDateTime}|${left.seqNumber}`;
  const rightKey = `${right.opeDateTime}|${right.submitDateTime}|${right.seqNumber}`;
  return rightKey > leftKey ? right : left;
}

function dedupeDocuments(docs: EdinetDoc[]): EdinetDoc[] {
  const byId = new Map<string, EdinetDoc>();
  for (const doc of docs) {
    const existing = byId.get(doc.docID);
    byId.set(doc.docID, existing ? preferLatest(existing, doc) : doc);
  }
  return [...byId.values()].sort((a, b) =>
    `${a.submitDateTime}|${a.docID}`.localeCompare(`${b.submitDateTime}|${b.docID}`),
  );
}

export function buildSanrioEdinetInventory(input: {
  from: string;
  to: string;
  generatedAt: string;
  scannedBusinessDays: number;
  failedDates: SanrioEdinetFailure[];
  docs: EdinetDoc[];
}): SanrioEdinetInventory {
  assertIsoDate(input.from, "from");
  assertIsoDate(input.to, "to");
  if (input.from > input.to) throw new Error("from must be on or before to");
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("generatedAt must be an ISO date-time");
  }
  if (!Number.isInteger(input.scannedBusinessDays) || input.scannedBusinessDays < 0) {
    throw new Error("scannedBusinessDays must be a non-negative integer");
  }

  const docs = dedupeDocuments(input.docs.filter(isSanrioPrimaryDisclosure));
  const candidates = docs.map((doc): SanrioEdinetCandidate => {
    const reasons = reviewReasons(doc);
    return {
      doc,
      reviewPriority: reasons.length > 0 ? "high" : "normal",
      reviewReasons: reasons,
      retrievableByLegalStatus: ["1", "2"].includes(doc.legalStatus.trim()),
      documentTypePlan: documentTypePlan(doc),
    };
  });

  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: SANRIO_EDINET_CODE,
      secCode: SANRIO_SEC_CODE,
    },
    range: { from: input.from, to: input.to },
    generatedAt: input.generatedAt,
    scannedBusinessDays: input.scannedBusinessDays,
    completeness: input.failedDates.length === 0 ? "complete" : "partial",
    failedDates: [...input.failedDates].sort((a, b) => a.date.localeCompare(b.date)),
    candidates,
    lineage: buildEdinetDocumentLineage(docs),
    appendAuthorized: false,
  };
}

function failureCode(error: unknown): string {
  if (error instanceof EdinetApiError) {
    return error.status === 0 ? "network_error" : `http_${error.status}`;
  }
  return "unexpected_error";
}

export async function scanSanrioEdinetRange(
  from: string,
  to: string,
  options: SanrioEdinetScanOptions = {},
): Promise<SanrioEdinetInventory> {
  const dates = enumerateBusinessDates(from, to);
  const docs: EdinetDoc[] = [];
  const failedDates: SanrioEdinetFailure[] = [];
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const delayMs = Math.max(0, options.interRequestDelayMs ?? 300);

  for (let index = 0; index < dates.length; index++) {
    const date = dates[index]!;
    try {
      const daily = await fetchEdinetDocList(date, options);
      const matched = daily.filter(isSanrioPrimaryDisclosure);
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

  return buildSanrioEdinetInventory({
    from,
    to,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    scannedBusinessDays: dates.length,
    failedDates,
    docs,
  });
}
