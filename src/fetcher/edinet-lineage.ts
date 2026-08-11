import type { EdinetDoc } from "./edinet.js";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "../research/iso-instant.js";

export type EdinetLineageIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type EdinetLineageNode = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  relation: "root" | "parent_linked";
  revisionReviewHint:
    | "initial_candidate"
    | "correction_candidate"
    | "withdrawal_candidate"
    | "correction_or_withdrawal_candidate";
  requiresHumanReview: true;
  submitDateTime: string;
  opeDateTime: string;
  docDescription: string;
  formCode: string;
  docTypeCode: string;
  filerName: string;
  edinetCode: string;
  secCode: string;
  rawStatus: {
    withdrawalStatus: string;
    docInfoEditStatus: string;
    disclosureStatus: string;
    legalStatus: string;
  };
};

export type EdinetLineageResult = {
  nodes: EdinetLineageNode[];
  issues: EdinetLineageIssue[];
  hasBlockingIssues: boolean;
};

function normalized(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function flagIsActive(value: string): boolean {
  const current = normalized(value).toLowerCase();
  return current !== "" && current !== "0" && current !== "false" && current !== "none";
}

function correctionTextCandidate(doc: EdinetDoc): boolean {
  return /訂正|修正|差替|再提出/.test(
    `${doc.docDescription} ${doc.currentReportReason}`,
  );
}

function reviewHint(doc: EdinetDoc): EdinetLineageNode["revisionReviewHint"] {
  const parentLinked = normalized(doc.parentDocID) !== "" || correctionTextCandidate(doc);
  const withdrawal = flagIsActive(doc.withdrawalStatus);
  if (parentLinked && withdrawal) return "correction_or_withdrawal_candidate";
  if (withdrawal) return "withdrawal_candidate";
  if (parentLinked) return "correction_candidate";
  return "initial_candidate";
}

function issue(
  severity: EdinetLineageIssue["severity"],
  code: string,
  target: string,
  message: string,
): EdinetLineageIssue {
  return { severity, code, target, message };
}

function strictTimestamp(
  value: string,
  label: string,
): { valid: boolean; error: string | null } {
  try {
    parseExplicitIso8601Instant(value, label);
    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : `${label} is invalid`,
    };
  }
}

function findCycle(
  start: string,
  parentByDocID: Map<string, string>,
): string[] | null {
  const order: string[] = [];
  const seenAt = new Map<string, number>();
  let current: string | undefined = start;

  while (current) {
    const existing = seenAt.get(current);
    if (existing !== undefined) return order.slice(existing).concat(current);
    seenAt.set(current, order.length);
    order.push(current);
    current = parentByDocID.get(current);
  }

  return null;
}

function resolveRoot(
  docID: string,
  parentByDocID: Map<string, string>,
  knownDocIDs: Set<string>,
): string {
  const visited = new Set<string>();
  let current = docID;
  while (!visited.has(current)) {
    visited.add(current);
    const parent = parentByDocID.get(current);
    if (!parent) return current;
    if (!knownDocIDs.has(parent)) return parent;
    current = parent;
  }
  return docID;
}

export function buildEdinetDocumentLineage(docs: EdinetDoc[]): EdinetLineageResult {
  const issues: EdinetLineageIssue[] = [];
  const byDocID = new Map<string, EdinetDoc>();
  const validSubmitDocIDs = new Set<string>();

  for (const doc of docs) {
    const docID = normalized(doc.docID);
    if (!docID || docID !== doc.docID) {
      issues.push(issue(
        "error",
        "invalid_doc_id",
        docID || "<empty>",
        "EDINET docID must be non-empty and free of surrounding whitespace",
      ));
      continue;
    }
    if (byDocID.has(docID)) {
      issues.push(issue("error", "duplicate_doc_id", docID, "duplicate EDINET docID"));
      continue;
    }
    byDocID.set(docID, doc);

    const submit = strictTimestamp(doc.submitDateTime, `${docID}.submitDateTime`);
    if (!submit.valid) {
      issues.push(issue(
        "error",
        "invalid_submit_datetime",
        docID,
        submit.error ?? "invalid EDINET submitDateTime",
      ));
    } else {
      validSubmitDocIDs.add(docID);
    }
  }

  const parentByDocID = new Map<string, string>();
  for (const doc of byDocID.values()) {
    const rawParent = doc.parentDocID ?? "";
    const parent = normalized(rawParent);
    if (!parent) continue;
    if (parent !== rawParent) {
      issues.push(issue(
        "error",
        "invalid_parent_doc_id",
        doc.docID,
        "EDINET parentDocID must be free of surrounding whitespace",
      ));
      continue;
    }
    parentByDocID.set(doc.docID, parent);

    if (parent === doc.docID) {
      issues.push(issue("error", "self_parent", doc.docID, "document references itself as parent"));
      continue;
    }

    const parentDoc = byDocID.get(parent);
    if (!parentDoc) {
      issues.push(issue(
        "warning",
        "missing_parent_document",
        doc.docID,
        `parent ${parent} is outside the observed document set`,
      ));
      continue;
    }

    if (
      validSubmitDocIDs.has(doc.docID)
      && validSubmitDocIDs.has(parentDoc.docID)
      && compareExplicitIso8601Instants(
        doc.submitDateTime,
        parentDoc.submitDateTime,
        `${doc.docID}.submitDateTime`,
        `${parentDoc.docID}.submitDateTime`,
      ) < 0
    ) {
      issues.push(issue(
        "error",
        "child_precedes_parent",
        doc.docID,
        `${doc.submitDateTime} < ${parentDoc.submitDateTime}`,
      ));
    }
  }

  const reportedCycles = new Set<string>();
  for (const docID of byDocID.keys()) {
    const cycle = findCycle(docID, parentByDocID);
    if (!cycle) continue;
    const identity = [...new Set(cycle)].sort().join("|");
    if (reportedCycles.has(identity)) continue;
    reportedCycles.add(identity);
    issues.push(issue("error", "lineage_cycle", docID, cycle.join(" -> ")));
  }

  const knownDocIDs = new Set(byDocID.keys());
  const nodes = [...byDocID.values()]
    .map((doc): EdinetLineageNode => {
      const rawParent = doc.parentDocID ?? "";
      const parent = normalized(rawParent);
      const canonicalParent = parent && parent === rawParent ? parent : null;
      return {
        docID: doc.docID,
        parentDocID: canonicalParent,
        chainRootDocID: resolveRoot(doc.docID, parentByDocID, knownDocIDs),
        relation: canonicalParent ? "parent_linked" : "root",
        revisionReviewHint: reviewHint(doc),
        requiresHumanReview: true,
        submitDateTime: doc.submitDateTime,
        opeDateTime: doc.opeDateTime,
        docDescription: doc.docDescription,
        formCode: doc.formCode,
        docTypeCode: doc.docTypeCode,
        filerName: doc.filerName,
        edinetCode: doc.edinetCode,
        secCode: doc.secCode,
        rawStatus: {
          withdrawalStatus: doc.withdrawalStatus,
          docInfoEditStatus: doc.docInfoEditStatus,
          disclosureStatus: doc.disclosureStatus,
          legalStatus: doc.legalStatus,
        },
      };
    })
    .sort((a, b) => {
      const aValid = validSubmitDocIDs.has(a.docID);
      const bValid = validSubmitDocIDs.has(b.docID);
      if (aValid && bValid) {
        const instantOrder = compareExplicitIso8601Instants(
          a.submitDateTime,
          b.submitDateTime,
          `${a.docID}.submitDateTime`,
          `${b.docID}.submitDateTime`,
        );
        if (instantOrder !== 0) return instantOrder;
      } else if (aValid !== bValid) {
        return aValid ? -1 : 1;
      }
      return a.docID.localeCompare(b.docID);
    });

  issues.sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );

  return {
    nodes,
    issues,
    hasBlockingIssues: issues.some(value => value.severity === "error"),
  };
}
