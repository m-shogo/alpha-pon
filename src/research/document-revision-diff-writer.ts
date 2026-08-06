import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { EvidenceSnapshot } from "./bitemporal-evidence-store.js";
import {
  parseDocumentRevisionDiffJsonl,
  type DocumentDiffRecord,
  type DocumentRevisionDiffSchemas,
  type DocumentRevisionRecord,
} from "./document-revision-diff.js";
import {
  validateDocumentRevisionDiffAtCutoff,
  validateIncomingDocumentRevisionDiffCutoff,
} from "./document-revision-diff-governed.js";
import {
  computeEvidenceSnapshotHash,
} from "./claim-contradiction-graph-hardening.js";

export type DocumentRevisionDiffStorePaths = {
  revisions: string;
  diffs: string;
};

export type DocumentRevisionDiffAppendBatch = {
  revisions: DocumentRevisionRecord[];
  diffs: DocumentDiffRecord[];
};

function readStrictJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseDocumentRevisionDiffJsonl<T>(content, path);
}

function fsyncPath(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeJournal(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf-8");
  fsyncPath(path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const ownerPath = `${lockPath}/owner.json`;
  if (!existsSync(ownerPath)) {
    throw new Error(`Document Revision lock owner metadata is missing: ${ownerPath}`);
  }
  const owner = JSON.parse(readFileSync(ownerPath, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(
      `Document Revision lock ownership changed; refusing to remove ${lockPath}`,
    );
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendDocumentRevisionDiffRecordsAtCutoffGoverned(
  paths: DocumentRevisionDiffStorePaths,
  incoming: DocumentRevisionDiffAppendBatch,
  ownerToken: string,
  schemas: DocumentRevisionDiffSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): void {
  if (incoming.revisions.length === 0 && incoming.diffs.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  if (evidenceSnapshot.mode !== "system_replay") {
    throw new Error("Document Revision writer requires system_replay Evidence Snapshot");
  }
  mkdirSync(dirname(paths.revisions), { recursive: true });
  mkdirSync(dirname(paths.diffs), { recursive: true });

  const lockPath = `${paths.revisions}.document-revision.lock`;
  const journalPath = `${paths.revisions}.batch-journal.json`;
  if (existsSync(journalPath)) {
    throw new Error(`incomplete_document_revision_batch: ${journalPath}`);
  }
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Document Revision lock is already held: ${lockPath}`);
    }
    throw error;
  }

  let ownerWritten = false;
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    ownerWritten = true;

    const existingRevisions = readStrictJsonl<DocumentRevisionRecord>(paths.revisions);
    const existingDiffs = readStrictJsonl<DocumentDiffRecord>(paths.diffs);
    const nextRevisions = [...existingRevisions, ...incoming.revisions];
    const nextDiffs = [...existingDiffs, ...incoming.diffs];
    const errors = [
      ...validateIncomingDocumentRevisionDiffCutoff(
        incoming.revisions,
        incoming.diffs,
        evidenceSnapshot,
      ),
      ...validateDocumentRevisionDiffAtCutoff(
        nextRevisions,
        nextDiffs,
        schemas,
        evidenceSnapshot,
        knownEntityIds,
      ),
    ].filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"),
      );
    }

    const journalBase = {
      ownerToken,
      revisionCount: incoming.revisions.length,
      diffCount: incoming.diffs.length,
      evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
      cutoff: evidenceSnapshot.asOf,
    };
    writeJournal(journalPath, { ...journalBase, state: "prepared" });

    if (incoming.revisions.length > 0) {
      const fd = openSync(paths.revisions, "a");
      try {
        appendFileSync(
          fd,
          `${incoming.revisions.map((record) => JSON.stringify(record)).join("\n")}\n`,
          "utf-8",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    writeJournal(journalPath, { ...journalBase, state: "revisions_appended" });

    if (incoming.diffs.length > 0) {
      const fd = openSync(paths.diffs, "a");
      try {
        appendFileSync(
          fd,
          `${incoming.diffs.map((record) => JSON.stringify(record)).join("\n")}\n`,
          "utf-8",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    writeJournal(journalPath, { ...journalBase, state: "committed" });
    rmSync(journalPath, { force: false });
  } finally {
    if (ownerWritten) {
      releaseLock(lockPath, ownerToken);
    } else if (existsSync(lockPath)) {
      rmSync(lockPath, { recursive: true, force: true });
    }
  }
}
