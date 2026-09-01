import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  parseEvidenceJsonl,
  type EvidenceRecord,
  type EvidenceRelationRecord,
  type EvidenceStoreSchemas,
} from "./bitemporal-evidence-store.js";
import {
  validateBitemporalEvidenceStoreGoverned,
} from "./bitemporal-evidence-hardening.js";

function assertSafeEvidenceStoreFile(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    throw new Error(`Evidence Store path must be a single-link regular file: ${path}`);
  }
}

function readStrictJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  assertSafeEvidenceStoreFile(path);
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseEvidenceJsonl<T>(content, path);
}

function writeJournal(path: string, journal: unknown): void {
  writeFileSync(path, `${JSON.stringify(journal)}\n`, "utf-8");
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Evidence Store lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendEvidenceStoreRecordsGovernedStrict(
  paths: { evidence: string; relations: string },
  incoming: { evidence: EvidenceRecord[]; relations: EvidenceRelationRecord[] },
  ownerToken: string,
  schemas: EvidenceStoreSchemas,
  knownEntityIds?: ReadonlySet<string>,
): void {
  if (incoming.evidence.length === 0 && incoming.relations.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(paths.evidence), { recursive: true });
  mkdirSync(dirname(paths.relations), { recursive: true });
  const lockPath = `${paths.evidence}.evidence-store.lock`;
  const journalPath = `${paths.evidence}.batch-journal.json`;
  if (existsSync(journalPath)) throw new Error(`incomplete_evidence_batch:${journalPath}`);
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Evidence Store lock is already held: ${lockPath}`);
    }
    throw error;
  }

  let committed = false;
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existingEvidence = readStrictJsonl<EvidenceRecord>(paths.evidence);
    const existingRelations = readStrictJsonl<EvidenceRelationRecord>(paths.relations);
    const allEvidence = [...existingEvidence, ...incoming.evidence];
    const allRelations = [...existingRelations, ...incoming.relations];
    const errors = validateBitemporalEvidenceStoreGoverned(
      allEvidence,
      allRelations,
      schemas,
      knownEntityIds,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }

    const journal = {
      schemaVersion: 1,
      ownerToken,
      preparedAt: new Date().toISOString(),
      state: "prepared",
      evidenceHashes: incoming.evidence.map((record) => record.contentHash).sort(),
      relationHashes: incoming.relations.map((record) => record.contentHash).sort(),
    };
    writeJournal(journalPath, journal);

    const append = (path: string, records: unknown[]): void => {
      if (records.length === 0) return;
      assertSafeEvidenceStoreFile(path);
      const fd = openSync(path, "a");
      try {
        appendFileSync(fd, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    };
    append(paths.evidence, incoming.evidence);
    writeJournal(journalPath, { ...journal, state: "evidence_appended" });
    append(paths.relations, incoming.relations);
    writeJournal(journalPath, { ...journal, state: "committed" });
    committed = true;
  } finally {
    if (committed && existsSync(journalPath)) rmSync(journalPath);
    releaseLock(lockPath, ownerToken);
  }
}
