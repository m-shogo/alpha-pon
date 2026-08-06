import { createHash } from "node:crypto";

const SANRIO_EDINET_CODE = "E02655";
const SANRIO_SEC_CODE = "81360";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const PUBLIC_DOCUMENT_PATTERN = /^(?:XBRL\/)?PublicDoc\/.+\.(?:html?|xhtml|xml|xbrl|txt)$/i;
const MAX_PREVIEW_LINES = 8;

type UnknownRecord = Record<string, unknown>;

type ReviewAcquisition = {
  documentType: string;
  format: string;
  binaryFile: string;
  sha256: string;
  byteLength: number;
};

type ReviewDocument = {
  docID: string;
  parentDocID: string | null;
  chainRootDocID: string;
  submitDateTime: string | null;
  description: string;
  acquisitions: ReviewAcquisition[];
};

export type SanrioEdinetRevisionPairPlan = {
  pairId: string;
  groupId: string;
  chainRootDocID: string;
  fromDocID: string;
  toDocID: string;
  fromDescription: string;
  toDescription: string;
  fromSubmitDateTime: string | null;
  toSubmitDateTime: string | null;
  fromZipFile: string;
  toZipFile: string;
  fromZipSha256: string;
  toZipSha256: string;
};

export type SanrioEdinetRevisionDiffPlan = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: typeof SANRIO_EDINET_CODE;
    secCode: typeof SANRIO_SEC_CODE;
  };
  sourceReviewWorkspaceHash: string;
  pairs: SanrioEdinetRevisionPairPlan[];
  appendAuthorized: false;
};

export type SanrioEdinetArchiveEntry = {
  path: string;
  content: string;
};

export type SanrioEdinetEntryChange = {
  path: string;
  changeType: "added" | "removed" | "modified";
  beforeHash?: string;
  afterHash?: string;
  beforeLineCount: number;
  afterLineCount: number;
  changedBeforeLineCount: number;
  changedAfterLineCount: number;
  commonPrefixLineCount: number;
  commonSuffixLineCount: number;
  beforePreview: string[];
  afterPreview: string[];
  semanticType: "unknown_pending_human_review";
  materiality: "unknown_pending_human_review";
  direction: "unknown_pending_human_review";
};

export type SanrioEdinetRevisionPairDiff = {
  pairId: string;
  groupId: string;
  chainRootDocID: string;
  fromDocID: string;
  toDocID: string;
  fromDescription: string;
  toDescription: string;
  fromSubmitDateTime: string | null;
  toSubmitDateTime: string | null;
  fromZipSha256: string;
  toZipSha256: string;
  publicDocumentEntryCountBefore: number;
  publicDocumentEntryCountAfter: number;
  unchangedEntryCount: number;
  addedEntryCount: number;
  removedEntryCount: number;
  modifiedEntryCount: number;
  changes: SanrioEdinetEntryChange[];
  reviewStatus: "pending_human_review";
  blockers: string[];
  pairDiffHash: string;
};

export type SanrioEdinetRevisionDiffWorkspace = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: typeof SANRIO_EDINET_CODE;
    secCode: typeof SANRIO_SEC_CODE;
  };
  sourceReviewWorkspaceHash: string;
  generatedAt: string;
  pairCount: number;
  changedEntryCount: number;
  reviewStatus: "pending_human_review";
  pairs: SanrioEdinetRevisionPairDiff[];
  globalBlockers: string[];
  appendAuthorized: false;
  diffWorkspaceHash: string;
};

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requireString(value: unknown, field: string): string {
  const result = asString(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!DOC_ID_PATTERN.test(result)) throw new Error(`${field} is not a valid EDINET docID`);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!HASH_PATTERN.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireFileName(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function optionalTimestamp(value: unknown, field: string): string | null {
  const result = asString(value);
  if (!result) return null;
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function requireTimestamp(value: unknown, field: string): string {
  const result = optionalTimestamp(value, field);
  if (!result) throw new Error(`${field} must be a date-time`);
  return result;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function parseAcquisitions(value: unknown, field: string): ReviewAcquisition[] {
  return asArray(value, field).map((raw, index) => {
    const record = asRecord(raw, `${field}[${index}]`);
    return {
      documentType: requireString(record.documentType, `${field}[${index}].documentType`),
      format: requireString(record.format, `${field}[${index}].format`),
      binaryFile: requireFileName(record.binaryFile, `${field}[${index}].binaryFile`),
      sha256: requireHash(record.sha256, `${field}[${index}].sha256`),
      byteLength: requirePositiveInteger(record.byteLength, `${field}[${index}].byteLength`),
    };
  });
}

function parseDocument(value: unknown, field: string): ReviewDocument {
  const record = asRecord(value, field);
  const parentDocID = asString(record.parentDocID) || null;
  if (parentDocID && !DOC_ID_PATTERN.test(parentDocID)) {
    throw new Error(`${field}.parentDocID is invalid`);
  }
  return {
    docID: requireDocID(record.docID, `${field}.docID`),
    parentDocID,
    chainRootDocID: requireDocID(record.chainRootDocID, `${field}.chainRootDocID`),
    submitDateTime: optionalTimestamp(record.submitDateTime, `${field}.submitDateTime`),
    description: requireString(record.description, `${field}.description`),
    acquisitions: parseAcquisitions(record.acquisitions, `${field}.acquisitions`),
  };
}

function structuredZip(document: ReviewDocument, field: string): ReviewAcquisition {
  const matches = document.acquisitions.filter(
    acquisition => acquisition.documentType === "1" && acquisition.format === "zip",
  );
  if (matches.length !== 1) {
    throw new Error(`${field} requires exactly one type=1 ZIP acquisition`);
  }
  return matches[0]!;
}

export function buildSanrioEdinetRevisionDiffPlan(
  workspaceValue: unknown,
): SanrioEdinetRevisionDiffPlan {
  const workspace = asRecord(workspaceValue, "reviewWorkspace");
  if (workspace.schemaVersion !== 1 || workspace.source !== "edinet") {
    throw new Error("reviewWorkspace schema/source is unsupported");
  }
  if (workspace.reviewStatus !== "pending_human_review") {
    throw new Error("reviewWorkspace must remain pending_human_review");
  }
  if (workspace.appendAuthorized !== false) {
    throw new Error("reviewWorkspace.appendAuthorized must be false");
  }
  const issuer = asRecord(workspace.issuer, "reviewWorkspace.issuer");
  if (
    asString(issuer.edinetCode) !== SANRIO_EDINET_CODE
    || asString(issuer.secCode) !== SANRIO_SEC_CODE
  ) {
    throw new Error("reviewWorkspace issuer is not Sanrio");
  }
  const sourceReviewWorkspaceHash = requireHash(
    workspace.workspaceHash,
    "reviewWorkspace.workspaceHash",
  );

  const pairs: SanrioEdinetRevisionPairPlan[] = [];
  for (const [groupIndex, rawGroup] of asArray(workspace.groups, "reviewWorkspace.groups").entries()) {
    const group = asRecord(rawGroup, `reviewWorkspace.groups[${groupIndex}]`);
    const groupId = requireString(group.groupId, `reviewWorkspace.groups[${groupIndex}].groupId`);
    const chainRootDocID = requireDocID(
      group.chainRootDocID,
      `reviewWorkspace.groups[${groupIndex}].chainRootDocID`,
    );
    const documents = asArray(
      group.documents,
      `reviewWorkspace.groups[${groupIndex}].documents`,
    ).map((value, documentIndex) => parseDocument(
      value,
      `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}]`,
    ));
    const byDocID = new Map(documents.map(document => [document.docID, document]));

    for (const child of documents) {
      if (!child.description.includes("訂正有価証券報告書")) continue;
      if (!child.parentDocID) {
        throw new Error(`${child.docID} correction filing has no parentDocID`);
      }
      const parent = byDocID.get(child.parentDocID);
      if (!parent) throw new Error(`${child.docID} parent is missing from review group`);
      const fromZip = structuredZip(parent, `${parent.docID} parent`);
      const toZip = structuredZip(child, `${child.docID} correction`);
      pairs.push({
        pairId: `edinet:${parent.docID}->${child.docID}`,
        groupId,
        chainRootDocID,
        fromDocID: parent.docID,
        toDocID: child.docID,
        fromDescription: parent.description,
        toDescription: child.description,
        fromSubmitDateTime: parent.submitDateTime,
        toSubmitDateTime: child.submitDateTime,
        fromZipFile: fromZip.binaryFile,
        toZipFile: toZip.binaryFile,
        fromZipSha256: fromZip.sha256,
        toZipSha256: toZip.sha256,
      });
    }
  }

  pairs.sort((left, right) => left.pairId.localeCompare(right.pairId));
  if (pairs.length === 0) throw new Error("reviewWorkspace has no correction pairs to compare");
  const identities = new Set<string>();
  for (const pair of pairs) {
    if (identities.has(pair.pairId)) throw new Error(`duplicate correction pair ${pair.pairId}`);
    identities.add(pair.pairId);
  }

  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: SANRIO_EDINET_CODE,
      secCode: SANRIO_SEC_CODE,
    },
    sourceReviewWorkspaceHash,
    pairs,
    appendAuthorized: false,
  };
}

function decodeEntity(entity: string): string {
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const value = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(value) ? String.fromCodePoint(value) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const value = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : `&${entity};`;
  }
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return named[entity.toLowerCase()] ?? `&${entity};`;
}

export function normalizeEdinetPublicDocument(path: string, content: string): string {
  let value = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/\.(?:html?|xhtml|xml|xbrl)$/i.test(path)) {
    value = value
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(?:script|style|ix:hidden)\b[^>]*>[^]*?<\/(?:script|style|ix:hidden)>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:address|article|aside|blockquote|caption|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&([A-Za-z]+|#\d+|#x[0-9A-Fa-f]+);/g, (_match, entity: string) => decodeEntity(entity));
  }
  return value
    .normalize("NFC")
    .replace(/[\u00A0\u3000]/g, " ")
    .split("\n")
    .map(line => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function isEdinetPublicDocumentEntry(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const segments = path.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  return PUBLIC_DOCUMENT_PATTERN.test(path);
}

function normalizedEntries(entries: SanrioEdinetArchiveEntry[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    if (!isEdinetPublicDocumentEntry(entry.path)) {
      throw new Error(`archiveEntries[${index}].path is outside EDINET PublicDoc`);
    }
    if (result.has(entry.path)) throw new Error(`duplicate archive entry ${entry.path}`);
    const normalized = normalizeEdinetPublicDocument(entry.path, entry.content);
    if (normalized) result.set(entry.path, normalized);
  }
  if (result.size === 0) throw new Error("archive has no non-empty EDINET PublicDoc entries");
  return result;
}

function changedWindow(before: string, after: string): {
  beforeLines: string[];
  afterLines: string[];
  prefix: number;
  suffix: number;
} {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let prefix = 0;
  while (
    prefix < beforeLines.length
    && prefix < afterLines.length
    && beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix
    && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return { beforeLines, afterLines, prefix, suffix };
}

function preview(lines: string[]): string[] {
  return lines.slice(0, MAX_PREVIEW_LINES).map(line => line.slice(0, 500));
}

function entryChange(path: string, before: string | null, after: string | null): SanrioEdinetEntryChange {
  const beforeLines = before ? before.split("\n") : [];
  const afterLines = after ? after.split("\n") : [];
  if (before === null) {
    return {
      path,
      changeType: "added",
      afterHash: hashValue(after),
      beforeLineCount: 0,
      afterLineCount: afterLines.length,
      changedBeforeLineCount: 0,
      changedAfterLineCount: afterLines.length,
      commonPrefixLineCount: 0,
      commonSuffixLineCount: 0,
      beforePreview: [],
      afterPreview: preview(afterLines),
      semanticType: "unknown_pending_human_review",
      materiality: "unknown_pending_human_review",
      direction: "unknown_pending_human_review",
    };
  }
  if (after === null) {
    return {
      path,
      changeType: "removed",
      beforeHash: hashValue(before),
      beforeLineCount: beforeLines.length,
      afterLineCount: 0,
      changedBeforeLineCount: beforeLines.length,
      changedAfterLineCount: 0,
      commonPrefixLineCount: 0,
      commonSuffixLineCount: 0,
      beforePreview: preview(beforeLines),
      afterPreview: [],
      semanticType: "unknown_pending_human_review",
      materiality: "unknown_pending_human_review",
      direction: "unknown_pending_human_review",
    };
  }

  const window = changedWindow(before, after);
  const beforeEnd = window.beforeLines.length - window.suffix;
  const afterEnd = window.afterLines.length - window.suffix;
  const changedBefore = window.beforeLines.slice(window.prefix, beforeEnd);
  const changedAfter = window.afterLines.slice(window.prefix, afterEnd);
  return {
    path,
    changeType: "modified",
    beforeHash: hashValue(before),
    afterHash: hashValue(after),
    beforeLineCount: window.beforeLines.length,
    afterLineCount: window.afterLines.length,
    changedBeforeLineCount: changedBefore.length,
    changedAfterLineCount: changedAfter.length,
    commonPrefixLineCount: window.prefix,
    commonSuffixLineCount: window.suffix,
    beforePreview: preview(changedBefore),
    afterPreview: preview(changedAfter),
    semanticType: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
}

export function compareSanrioEdinetRevisionEntries(input: {
  pair: SanrioEdinetRevisionPairPlan;
  beforeEntries: SanrioEdinetArchiveEntry[];
  afterEntries: SanrioEdinetArchiveEntry[];
}): SanrioEdinetRevisionPairDiff {
  const before = normalizedEntries(input.beforeEntries);
  const after = normalizedEntries(input.afterEntries);
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: SanrioEdinetEntryChange[] = [];
  let unchangedEntryCount = 0;

  for (const path of paths) {
    const beforeValue = before.get(path) ?? null;
    const afterValue = after.get(path) ?? null;
    if (beforeValue !== null && afterValue !== null && hashValue(beforeValue) === hashValue(afterValue)) {
      unchangedEntryCount += 1;
      continue;
    }
    changes.push(entryChange(path, beforeValue, afterValue));
  }

  const base = {
    pairId: input.pair.pairId,
    groupId: input.pair.groupId,
    chainRootDocID: input.pair.chainRootDocID,
    fromDocID: input.pair.fromDocID,
    toDocID: input.pair.toDocID,
    fromDescription: input.pair.fromDescription,
    toDescription: input.pair.toDescription,
    fromSubmitDateTime: input.pair.fromSubmitDateTime,
    toSubmitDateTime: input.pair.toSubmitDateTime,
    fromZipSha256: input.pair.fromZipSha256,
    toZipSha256: input.pair.toZipSha256,
    publicDocumentEntryCountBefore: before.size,
    publicDocumentEntryCountAfter: after.size,
    unchangedEntryCount,
    addedEntryCount: changes.filter(change => change.changeType === "added").length,
    removedEntryCount: changes.filter(change => change.changeType === "removed").length,
    modifiedEntryCount: changes.filter(change => change.changeType === "modified").length,
    changes,
    reviewStatus: "pending_human_review" as const,
    blockers: [
      "human_changed_section_review_required",
      "semantic_type_confirmation_required",
      "materiality_confirmation_required",
      "direction_confirmation_required",
      "revision_relation_confirmation_required",
      "foundation_preview_not_authorized",
    ].sort(),
  };
  return { ...base, pairDiffHash: hashValue(base) };
}

export function buildSanrioEdinetRevisionDiffWorkspace(input: {
  plan: SanrioEdinetRevisionDiffPlan;
  pairs: SanrioEdinetRevisionPairDiff[];
  generatedAt?: string;
}): SanrioEdinetRevisionDiffWorkspace {
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  if (input.plan.appendAuthorized !== false) throw new Error("diff plan must not authorize append");
  const expected = input.plan.pairs.map(pair => pair.pairId).sort();
  const actual = input.pairs.map(pair => pair.pairId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("diff results do not match planned correction pairs");
  }
  const pairs = [...input.pairs].sort((left, right) => left.pairId.localeCompare(right.pairId));
  for (const pair of pairs) {
    const { pairDiffHash: _hash, ...withoutHash } = pair;
    if (pair.pairDiffHash !== hashValue(withoutHash)) {
      throw new Error(`${pair.pairId} pairDiffHash mismatch`);
    }
  }
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceReviewWorkspaceHash: input.plan.sourceReviewWorkspaceHash,
    pairs,
    appendAuthorized: false,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: input.plan.issuer,
    sourceReviewWorkspaceHash: input.plan.sourceReviewWorkspaceHash,
    generatedAt,
    pairCount: pairs.length,
    changedEntryCount: pairs.reduce((sum, pair) => sum + pair.changes.length, 0),
    reviewStatus: "pending_human_review",
    pairs,
    globalBlockers: [
      "human_review_required",
      "semantic_mapping_not_confirmed",
      "materiality_not_confirmed",
      "direction_not_confirmed",
      "security_master_resolution_required",
      "pit_times_confirmation_required",
      "document_revision_diff_append_not_authorized",
    ].sort(),
    appendAuthorized: false,
    diffWorkspaceHash: hashValue(hashPayload),
  };
}

export function renderSanrioEdinetRevisionDiffReview(
  workspace: SanrioEdinetRevisionDiffWorkspace,
): string {
  const lines = [
    "# Sanrio EDINET revision diff review",
    "",
    `- generatedAt: ${workspace.generatedAt}`,
    `- sourceReviewWorkspaceHash: ${workspace.sourceReviewWorkspaceHash}`,
    `- diffWorkspaceHash: ${workspace.diffWorkspaceHash}`,
    `- pairCount: ${workspace.pairCount}`,
    `- changedEntryCount: ${workspace.changedEntryCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Required boundaries",
    "",
    "- [ ] Treat extracted changes as candidates, not confirmed facts or investment conclusions.",
    "- [ ] Open the original and corrected PDF beside the structured ZIP comparison.",
    "- [ ] Separate newly disclosed facts, previously known facts, assumptions, and opinion.",
    "- [ ] Confirm semantic type, materiality, direction, correction scope, and supersession strength.",
    "- [ ] Confirm Security Master identity and PIT timestamps before Foundation preview.",
    "",
  ];

  for (const pair of workspace.pairs) {
    lines.push(
      `## ${pair.fromDocID} → ${pair.toDocID}`,
      "",
      `- original: ${pair.fromDescription}`,
      `- corrected: ${pair.toDescription}`,
      `- original ZIP SHA-256: ${pair.fromZipSha256}`,
      `- corrected ZIP SHA-256: ${pair.toZipSha256}`,
      `- unchanged entries: ${pair.unchangedEntryCount}`,
      `- modified entries: ${pair.modifiedEntryCount}`,
      `- added entries: ${pair.addedEntryCount}`,
      `- removed entries: ${pair.removedEntryCount}`,
      `- pairDiffHash: ${pair.pairDiffHash}`,
      "",
      "| status | PublicDoc path | before lines | after lines |",
      "|---|---|---:|---:|",
    );
    for (const change of pair.changes) {
      lines.push(
        `| ${change.changeType} | \`${change.path.replace(/\|/g, "\\|")}\` | ${change.changedBeforeLineCount} | ${change.changedAfterLineCount} |`,
      );
    }
    lines.push("", "### Human review", "");
    for (const change of pair.changes) {
      lines.push(
        `- [ ] ${change.changeType}: \`${change.path}\` — confirm exact changed claims, semantic type, materiality and direction.`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
