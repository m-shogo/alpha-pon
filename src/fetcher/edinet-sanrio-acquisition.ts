import type { EdinetDocumentTypeCode } from "./edinet-document.js";

export const SANRIO_PILOT_EDINET_CODE = "E02655";
export const SANRIO_PILOT_SEC_CODE = "81360";

export type SanrioAcquisitionTask = {
  docID: string;
  documentType: EdinetDocumentTypeCode;
  format: "zip" | "pdf";
  reason:
    | "core_filing_structured"
    | "core_filing_human_review"
    | "supporting_document_human_review"
    | "fallback_human_review"
    | "fallback_structured"
    | "external_parent_structured"
    | "external_parent_human_review";
  sourceDocID: string;
  parentOutsideInventory: boolean;
};

export type SanrioAcquisitionPlan = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: typeof SANRIO_PILOT_EDINET_CODE;
    secCode: typeof SANRIO_PILOT_SEC_CODE;
  };
  sourceInventoryRange: {
    from: string;
    to: string;
  };
  tasks: SanrioAcquisitionTask[];
  appendAuthorized: false;
};

type UnknownRecord = Record<string, unknown>;

type CandidateView = {
  docID: string;
  parentDocID: string;
  description: string;
  availableTypes: Set<EdinetDocumentTypeCode>;
};

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function isDocumentType(value: string): value is EdinetDocumentTypeCode {
  return /^[1-5]$/.test(value);
}

function formatForType(type: EdinetDocumentTypeCode): "zip" | "pdf" {
  return type === "2" ? "pdf" : "zip";
}

function candidateView(value: unknown, index: number): CandidateView {
  const candidate = asRecord(value, `candidates[${index}]`);
  const doc = asRecord(candidate.doc, `candidates[${index}].doc`);
  const docID = asString(doc.docID);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(docID)) {
    throw new Error(`candidates[${index}].doc.docID is invalid`);
  }

  const availableTypes = new Set<EdinetDocumentTypeCode>();
  for (const [planIndex, rawPlan] of asArray(
    candidate.documentTypePlan,
    `candidates[${index}].documentTypePlan`,
  ).entries()) {
    const plan = asRecord(rawPlan, `candidates[${index}].documentTypePlan[${planIndex}]`);
    const type = asString(plan.type);
    if (!isDocumentType(type)) {
      throw new Error(`candidates[${index}].documentTypePlan[${planIndex}].type is invalid`);
    }
    availableTypes.add(type);
  }

  return {
    docID,
    parentDocID: asString(doc.parentDocID),
    description: asString(doc.docDescription),
    availableTypes,
  };
}

function task(
  docID: string,
  documentType: EdinetDocumentTypeCode,
  reason: SanrioAcquisitionTask["reason"],
  sourceDocID: string,
  parentOutsideInventory: boolean,
): SanrioAcquisitionTask {
  return {
    docID,
    documentType,
    format: formatForType(documentType),
    reason,
    sourceDocID,
    parentOutsideInventory,
  };
}

function candidateTasks(candidate: CandidateView): SanrioAcquisitionTask[] {
  const tasks: SanrioAcquisitionTask[] = [];
  const core = /(?:訂正)?有価証券報告書|半期報告書|四半期報告書|臨時報告書/.test(
    candidate.description,
  );
  const supporting = /確認書|内部統制報告書/.test(candidate.description);

  if (core) {
    if (candidate.availableTypes.has("1")) {
      tasks.push(task(candidate.docID, "1", "core_filing_structured", candidate.docID, false));
    }
    if (candidate.availableTypes.has("2")) {
      tasks.push(task(candidate.docID, "2", "core_filing_human_review", candidate.docID, false));
    }
    return tasks;
  }

  if (supporting) {
    if (candidate.availableTypes.has("2")) {
      tasks.push(task(
        candidate.docID,
        "2",
        "supporting_document_human_review",
        candidate.docID,
        false,
      ));
    } else if (candidate.availableTypes.has("1")) {
      tasks.push(task(candidate.docID, "1", "fallback_structured", candidate.docID, false));
    }
    return tasks;
  }

  if (candidate.availableTypes.has("2")) {
    tasks.push(task(candidate.docID, "2", "fallback_human_review", candidate.docID, false));
  } else if (candidate.availableTypes.has("1")) {
    tasks.push(task(candidate.docID, "1", "fallback_structured", candidate.docID, false));
  }
  return tasks;
}

function validateInventory(value: unknown): {
  record: UnknownRecord;
  candidates: CandidateView[];
  range: { from: string; to: string };
} {
  const record = asRecord(value, "inventory");
  if (record.schemaVersion !== 1) throw new Error("inventory.schemaVersion must be 1");
  if (record.source !== "edinet") throw new Error("inventory.source must be edinet");
  if (record.appendAuthorized !== false) {
    throw new Error("inventory.appendAuthorized must be false");
  }
  if (record.completeness !== "complete") {
    throw new Error("inventory must be complete before acquisition");
  }
  if (asArray(record.failedDates, "inventory.failedDates").length > 0) {
    throw new Error("inventory.failedDates must be empty before acquisition");
  }

  const issuer = asRecord(record.issuer, "inventory.issuer");
  if (asString(issuer.edinetCode) !== SANRIO_PILOT_EDINET_CODE) {
    throw new Error("inventory issuer EDINET code is not Sanrio");
  }
  if (asString(issuer.secCode) !== SANRIO_PILOT_SEC_CODE) {
    throw new Error("inventory issuer securities code is not Sanrio");
  }

  const rangeRecord = asRecord(record.range, "inventory.range");
  const from = asString(rangeRecord.from);
  const to = asString(rangeRecord.to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("inventory range must use YYYY-MM-DD");
  }

  const candidates = asArray(record.candidates, "inventory.candidates").map(candidateView);
  if (candidates.length === 0) throw new Error("inventory has no Sanrio candidates");
  return { record, candidates, range: { from, to } };
}

export function buildSanrioEdinetAcquisitionPlan(value: unknown): SanrioAcquisitionPlan {
  const { candidates, range } = validateInventory(value);
  const knownDocIDs = new Set(candidates.map(candidate => candidate.docID));
  const tasks: SanrioAcquisitionTask[] = [];

  for (const candidate of candidates) {
    tasks.push(...candidateTasks(candidate));
    if (
      candidate.parentDocID
      && /^[A-Za-z0-9_-]{4,64}$/.test(candidate.parentDocID)
      && !knownDocIDs.has(candidate.parentDocID)
    ) {
      tasks.push(task(
        candidate.parentDocID,
        "1",
        "external_parent_structured",
        candidate.docID,
        true,
      ));
      tasks.push(task(
        candidate.parentDocID,
        "2",
        "external_parent_human_review",
        candidate.docID,
        true,
      ));
    }
  }

  const deduped = new Map<string, SanrioAcquisitionTask>();
  for (const item of tasks) {
    const key = `${item.docID}|${item.documentType}`;
    const existing = deduped.get(key);
    if (!existing || (existing.parentOutsideInventory && !item.parentOutsideInventory)) {
      deduped.set(key, item);
    }
  }

  const ordered = [...deduped.values()].sort((a, b) =>
    `${a.docID}|${a.documentType}|${a.reason}`.localeCompare(
      `${b.docID}|${b.documentType}|${b.reason}`,
    ),
  );
  if (ordered.length === 0) throw new Error("inventory produced no acquisition tasks");

  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: SANRIO_PILOT_EDINET_CODE,
      secCode: SANRIO_PILOT_SEC_CODE,
    },
    sourceInventoryRange: range,
    tasks: ordered,
    appendAuthorized: false,
  };
}
