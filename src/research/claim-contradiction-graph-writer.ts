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
  parseClaimGraphJsonl,
  type ClaimGraphEdgeRecord,
  type ClaimGraphSchemas,
  type ClaimRecord,
} from "./claim-contradiction-graph.js";
import {
  computeEvidenceSnapshotHash,
  type ClaimGraphAppendBatch,
  type ClaimGraphStorePaths,
} from "./claim-contradiction-graph-hardening.js";
import {
  validateClaimGraphGovernedAtCutoff,
  validateIncomingClaimGraphCutoff,
} from "./claim-contradiction-graph-governed.js";

function readStrictJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseClaimGraphJsonl<T>(content, path);
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
    throw new Error(`Claim Graph lock owner metadata is missing: ${ownerPath}`);
  }
  const owner = JSON.parse(readFileSync(ownerPath, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Claim Graph lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendClaimGraphRecordsAtCutoffGoverned(
  paths: ClaimGraphStorePaths,
  incoming: ClaimGraphAppendBatch,
  ownerToken: string,
  schemas: ClaimGraphSchemas,
  evidenceSnapshot: EvidenceSnapshot,
  knownEntityIds?: ReadonlySet<string>,
): void {
  if (incoming.claims.length === 0 && incoming.edges.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  if (evidenceSnapshot.mode !== "system_replay") {
    throw new Error("Claim Graph writer requires system_replay Evidence Snapshot");
  }
  mkdirSync(dirname(paths.claims), { recursive: true });
  mkdirSync(dirname(paths.edges), { recursive: true });

  const lockPath = `${paths.claims}.claim-graph.lock`;
  const journalPath = `${paths.claims}.batch-journal.json`;
  if (existsSync(journalPath)) {
    throw new Error(`incomplete_claim_graph_batch: ${journalPath}`);
  }
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Claim Graph lock is already held: ${lockPath}`);
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
    const existingClaims = readStrictJsonl<ClaimRecord>(paths.claims);
    const existingEdges = readStrictJsonl<ClaimGraphEdgeRecord>(paths.edges);
    const nextClaims = [...existingClaims, ...incoming.claims];
    const nextEdges = [...existingEdges, ...incoming.edges];

    const errors = [
      ...validateIncomingClaimGraphCutoff(
        incoming.claims,
        incoming.edges,
        evidenceSnapshot,
      ),
      ...validateClaimGraphGovernedAtCutoff(
        nextClaims,
        nextEdges,
        schemas,
        evidenceSnapshot,
        knownEntityIds,
      ),
    ].filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }

    const journalBase = {
      ownerToken,
      claimCount: incoming.claims.length,
      edgeCount: incoming.edges.length,
      evidenceSnapshotHash: computeEvidenceSnapshotHash(evidenceSnapshot),
      cutoff: evidenceSnapshot.asOf,
    };
    writeJournal(journalPath, { ...journalBase, state: "prepared" });

    if (incoming.claims.length > 0) {
      const fd = openSync(paths.claims, "a");
      try {
        appendFileSync(
          fd,
          `${incoming.claims.map((record) => JSON.stringify(record)).join("\n")}\n`,
          "utf-8",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    writeJournal(journalPath, { ...journalBase, state: "claims_appended" });

    if (incoming.edges.length > 0) {
      const fd = openSync(paths.edges, "a");
      try {
        appendFileSync(
          fd,
          `${incoming.edges.map((record) => JSON.stringify(record)).join("\n")}\n`,
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
