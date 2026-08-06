import { createHash } from "node:crypto";
import {
  isEdinetPublicDocumentEntry,
  normalizeEdinetPublicDocument,
  type SanrioEdinetArchiveEntry,
  type SanrioEdinetEntryChange,
  type SanrioEdinetRevisionPairDiff,
  type SanrioEdinetRevisionPairPlan,
} from "./edinet-sanrio-revision-diff-workspace.js";

const MAX_PREVIEW_LINES = 8;

type UnknownRecord = Record<string, unknown>;

type NormalizedEntry = {
  path: string;
  content: string;
  contentHash: string;
  logicalKey: string;
};

type MatchedEntry = {
  before: NormalizedEntry;
  after: NormalizedEntry;
  basis: "exact_path" | "logical_role" | "identical_content_hash";
};

export type SanrioEdinetLogicalAlignmentDiagnostics = {
  exactPathMatches: number;
  logicalRoleMatches: number;
  identicalContentHashMatches: number;
  unmatchedBefore: number;
  unmatchedAfter: number;
};

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

function relativePublicDocPath(path: string): string {
  return path.replace(/^(?:XBRL\/)?PublicDoc\//i, "");
}

/**
 * Build a deterministic logical identity for an EDINET PublicDoc entry.
 *
 * EDINET correction packages commonly preserve the same document role and
 * accounting period while changing the correction sequence and submission
 * date embedded in the filename. Those packaging-only changes must not become
 * dozens of false added/removed candidates.
 *
 * The accounting-period date remains part of the key. Only the revision slot
 * and submission date are normalized. Ambiguous duplicate keys are never
 * paired automatically.
 */
export function edinetPublicDocumentLogicalKey(path: string): string {
  if (!isEdinetPublicDocumentEntry(path)) {
    throw new Error(`path is outside EDINET PublicDoc: ${path}`);
  }

  return relativePublicDocPath(path)
    .normalize("NFC")
    .toLowerCase()
    .replace(/s[0-9a-z]{7}/gi, "<docid>")
    .replace(/(e\d{5})(?:-\d{3})?/gi, "$1-<filer-slot>")
    .replace(
      /(\d{4}-\d{2}-\d{2})[_-]\d{2}[_-]\d{4}-\d{2}-\d{2}(?=[_.-]|$)/g,
      "$1_<revision-slot>_<submission-date>",
    )
    .replace(
      /(\d{8})[_-]\d{2}[_-]\d{8}(?=[_.-]|$)/g,
      "$1_<revision-slot>_<submission-date>",
    );
}

function normalizeEntries(entries: SanrioEdinetArchiveEntry[], field: string): Map<string, NormalizedEntry> {
  const result = new Map<string, NormalizedEntry>();
  for (const [index, entry] of entries.entries()) {
    if (!isEdinetPublicDocumentEntry(entry.path)) {
      throw new Error(`${field}[${index}].path is outside EDINET PublicDoc`);
    }
    if (result.has(entry.path)) throw new Error(`duplicate archive entry ${entry.path}`);
    const content = normalizeEdinetPublicDocument(entry.path, entry.content);
    if (!content) continue;
    result.set(entry.path, {
      path: entry.path,
      content,
      contentHash: hashValue(content),
      logicalKey: edinetPublicDocumentLogicalKey(entry.path),
    });
  }
  if (result.size === 0) throw new Error(`${field} has no non-empty EDINET PublicDoc entries`);
  return result;
}

function uniqueBuckets(
  entries: Iterable<NormalizedEntry>,
  key: (entry: NormalizedEntry) => string,
): Map<string, NormalizedEntry> {
  const buckets = new Map<string, NormalizedEntry[]>();
  for (const entry of entries) {
    const identity = key(entry);
    const current = buckets.get(identity) ?? [];
    current.push(entry);
    buckets.set(identity, current);
  }

  const unique = new Map<string, NormalizedEntry>();
  for (const [identity, values] of buckets) {
    if (values.length === 1) unique.set(identity, values[0]!);
  }
  return unique;
}

function consumeMatch(
  matched: MatchedEntry[],
  beforeRemaining: Map<string, NormalizedEntry>,
  afterRemaining: Map<string, NormalizedEntry>,
  before: NormalizedEntry,
  after: NormalizedEntry,
  basis: MatchedEntry["basis"],
): void {
  if (!beforeRemaining.has(before.path) || !afterRemaining.has(after.path)) return;
  matched.push({ before, after, basis });
  beforeRemaining.delete(before.path);
  afterRemaining.delete(after.path);
}

function alignEntries(input: {
  beforeEntries: SanrioEdinetArchiveEntry[];
  afterEntries: SanrioEdinetArchiveEntry[];
}): {
  before: Map<string, NormalizedEntry>;
  after: Map<string, NormalizedEntry>;
  matched: MatchedEntry[];
  beforeRemaining: Map<string, NormalizedEntry>;
  afterRemaining: Map<string, NormalizedEntry>;
  diagnostics: SanrioEdinetLogicalAlignmentDiagnostics;
} {
  const before = normalizeEntries(input.beforeEntries, "beforeEntries");
  const after = normalizeEntries(input.afterEntries, "afterEntries");
  const beforeRemaining = new Map(before);
  const afterRemaining = new Map(after);
  const matched: MatchedEntry[] = [];

  for (const path of [...before.keys()].sort()) {
    const left = beforeRemaining.get(path);
    const right = afterRemaining.get(path);
    if (left && right) consumeMatch(matched, beforeRemaining, afterRemaining, left, right, "exact_path");
  }

  const beforeByLogicalKey = uniqueBuckets(beforeRemaining.values(), entry => entry.logicalKey);
  const afterByLogicalKey = uniqueBuckets(afterRemaining.values(), entry => entry.logicalKey);
  for (const key of [...beforeByLogicalKey.keys()].sort()) {
    const left = beforeByLogicalKey.get(key);
    const right = afterByLogicalKey.get(key);
    if (left && right) consumeMatch(matched, beforeRemaining, afterRemaining, left, right, "logical_role");
  }

  const beforeByHash = uniqueBuckets(beforeRemaining.values(), entry => entry.contentHash);
  const afterByHash = uniqueBuckets(afterRemaining.values(), entry => entry.contentHash);
  for (const hash of [...beforeByHash.keys()].sort()) {
    const left = beforeByHash.get(hash);
    const right = afterByHash.get(hash);
    if (left && right) {
      consumeMatch(matched, beforeRemaining, afterRemaining, left, right, "identical_content_hash");
    }
  }

  matched.sort((left, right) =>
    `${left.before.path}|${left.after.path}|${left.basis}`.localeCompare(
      `${right.before.path}|${right.after.path}|${right.basis}`,
    ),
  );

  return {
    before,
    after,
    matched,
    beforeRemaining,
    afterRemaining,
    diagnostics: {
      exactPathMatches: matched.filter(item => item.basis === "exact_path").length,
      logicalRoleMatches: matched.filter(item => item.basis === "logical_role").length,
      identicalContentHashMatches: matched.filter(item => item.basis === "identical_content_hash").length,
      unmatchedBefore: beforeRemaining.size,
      unmatchedAfter: afterRemaining.size,
    },
  };
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

function changePath(beforePath: string | null, afterPath: string | null): string {
  if (beforePath && afterPath && beforePath !== afterPath) return `${beforePath} => ${afterPath}`;
  return beforePath ?? afterPath ?? "(unknown PublicDoc entry)";
}

function entryChange(
  before: NormalizedEntry | null,
  after: NormalizedEntry | null,
): SanrioEdinetEntryChange {
  const path = changePath(before?.path ?? null, after?.path ?? null);
  const beforeLines = before ? before.content.split("\n") : [];
  const afterLines = after ? after.content.split("\n") : [];

  if (!before && after) {
    return {
      path,
      changeType: "added",
      afterHash: after.contentHash,
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

  if (before && !after) {
    return {
      path,
      changeType: "removed",
      beforeHash: before.contentHash,
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

  if (!before || !after) throw new Error("entry change requires at least one side");
  const window = changedWindow(before.content, after.content);
  const beforeEnd = window.beforeLines.length - window.suffix;
  const afterEnd = window.afterLines.length - window.suffix;
  const changedBefore = window.beforeLines.slice(window.prefix, beforeEnd);
  const changedAfter = window.afterLines.slice(window.prefix, afterEnd);
  return {
    path,
    changeType: "modified",
    beforeHash: before.contentHash,
    afterHash: after.contentHash,
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

export function compareSanrioEdinetRevisionEntriesWithLogicalAlignment(input: {
  pair: SanrioEdinetRevisionPairPlan;
  beforeEntries: SanrioEdinetArchiveEntry[];
  afterEntries: SanrioEdinetArchiveEntry[];
}): {
  diff: SanrioEdinetRevisionPairDiff;
  diagnostics: SanrioEdinetLogicalAlignmentDiagnostics;
} {
  const aligned = alignEntries(input);
  const changes: SanrioEdinetEntryChange[] = [];
  let unchangedEntryCount = 0;

  for (const item of aligned.matched) {
    if (item.before.contentHash === item.after.contentHash) {
      unchangedEntryCount += 1;
      continue;
    }
    changes.push(entryChange(item.before, item.after));
  }

  for (const item of [...aligned.beforeRemaining.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    changes.push(entryChange(item, null));
  }
  for (const item of [...aligned.afterRemaining.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    changes.push(entryChange(null, item));
  }
  changes.sort((left, right) => `${left.changeType}|${left.path}`.localeCompare(`${right.changeType}|${right.path}`));

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
    publicDocumentEntryCountBefore: aligned.before.size,
    publicDocumentEntryCountAfter: aligned.after.size,
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

  return {
    diff: { ...base, pairDiffHash: hashValue(base) },
    diagnostics: aligned.diagnostics,
  };
}
