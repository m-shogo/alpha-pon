import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../research/iso-instant.js";
import type { MarketEventDatabase } from "./sqlite-store.js";

export type SourceCheckpoint = {
  sourceKey: string;
  sourceType: string;
  cursorValue: string | null;
  etag: string | null;
  lastModified: string | null;
  lastContentHash: string | null;
  lastCheckedAt: string;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  nextCheckAt: string | null;
  lastError: string | null;
};

export type SourceCheckpointWriteResult = "inserted" | "updated" | "unchanged";

type SourceCheckpointRow = {
  source_key: string;
  source_type: string;
  cursor_value: string | null;
  etag: string | null;
  last_modified: string | null;
  last_content_hash: string | null;
  last_checked_at: string;
  last_success_at: string | null;
  consecutive_failures: number;
  next_check_at: string | null;
  last_error: string | null;
};

function mapRow(row: SourceCheckpointRow): SourceCheckpoint {
  return {
    sourceKey: row.source_key,
    sourceType: row.source_type,
    cursorValue: row.cursor_value,
    etag: row.etag,
    lastModified: row.last_modified,
    lastContentHash: row.last_content_hash,
    lastCheckedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    consecutiveFailures: row.consecutive_failures,
    nextCheckAt: row.next_check_at,
    lastError: row.last_error,
  };
}

function validateCanonicalIdentity(value: string, fieldName: "sourceKey" | "sourceType"): void {
  if (!value) throw new Error(`${fieldName} is required`);
  if (value.trim() !== value) {
    throw new Error(`${fieldName} must be canonical without surrounding whitespace`);
  }
}

function validateCheckpoint(checkpoint: SourceCheckpoint): void {
  validateCanonicalIdentity(checkpoint.sourceKey, "sourceKey");
  validateCanonicalIdentity(checkpoint.sourceType, "sourceType");
  if (!Number.isInteger(checkpoint.consecutiveFailures) || checkpoint.consecutiveFailures < 0) {
    throw new Error("consecutiveFailures must be a non-negative integer");
  }
  if (checkpoint.lastContentHash !== null && !/^[a-f0-9]{64}$/.test(checkpoint.lastContentHash)) {
    throw new Error("lastContentHash must be a lowercase SHA-256 hash");
  }

  parseExplicitIso8601Instant(checkpoint.lastCheckedAt, "lastCheckedAt");

  if (checkpoint.lastSuccessAt !== null) {
    parseExplicitIso8601Instant(checkpoint.lastSuccessAt, "lastSuccessAt");
    if (
      compareExplicitIso8601Instants(
        checkpoint.lastSuccessAt,
        checkpoint.lastCheckedAt,
        "lastSuccessAt",
        "lastCheckedAt",
      ) > 0
    ) {
      throw new Error("lastSuccessAt must be on or before lastCheckedAt");
    }
  }

  if (checkpoint.nextCheckAt !== null) {
    parseExplicitIso8601Instant(checkpoint.nextCheckAt, "nextCheckAt");
    if (
      compareExplicitIso8601Instants(
        checkpoint.nextCheckAt,
        checkpoint.lastCheckedAt,
        "nextCheckAt",
        "lastCheckedAt",
      ) < 0
    ) {
      throw new Error("nextCheckAt must be on or after lastCheckedAt");
    }
  }
}

function sameCheckpoint(left: SourceCheckpoint, right: SourceCheckpoint): boolean {
  return left.sourceKey === right.sourceKey
    && left.sourceType === right.sourceType
    && left.cursorValue === right.cursorValue
    && left.etag === right.etag
    && left.lastModified === right.lastModified
    && left.lastContentHash === right.lastContentHash
    && left.lastCheckedAt === right.lastCheckedAt
    && left.lastSuccessAt === right.lastSuccessAt
    && left.consecutiveFailures === right.consecutiveFailures
    && left.nextCheckAt === right.nextCheckAt
    && left.lastError === right.lastError;
}

export function getSourceCheckpoint(db: MarketEventDatabase, sourceKey: string): SourceCheckpoint | null {
  validateCanonicalIdentity(sourceKey, "sourceKey");

  const row = db.prepare(`
    SELECT
      source_key,
      source_type,
      cursor_value,
      etag,
      last_modified,
      last_content_hash,
      last_checked_at,
      last_success_at,
      consecutive_failures,
      next_check_at,
      last_error
    FROM source_checkpoints
    WHERE source_key = ?
  `).get(sourceKey) as SourceCheckpointRow | undefined;

  if (!row) return null;
  const checkpoint = mapRow(row);
  validateCheckpoint(checkpoint);
  return checkpoint;
}

export function upsertSourceCheckpoint(
  db: MarketEventDatabase,
  checkpoint: SourceCheckpoint,
): SourceCheckpointWriteResult {
  validateCheckpoint(checkpoint);

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = getSourceCheckpoint(db, checkpoint.sourceKey);
    if (existing === null) {
      db.prepare(`
        INSERT INTO source_checkpoints (
          source_key,
          source_type,
          cursor_value,
          etag,
          last_modified,
          last_content_hash,
          last_checked_at,
          last_success_at,
          consecutive_failures,
          next_check_at,
          last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        checkpoint.sourceKey,
        checkpoint.sourceType,
        checkpoint.cursorValue,
        checkpoint.etag,
        checkpoint.lastModified,
        checkpoint.lastContentHash,
        checkpoint.lastCheckedAt,
        checkpoint.lastSuccessAt,
        checkpoint.consecutiveFailures,
        checkpoint.nextCheckAt,
        checkpoint.lastError,
      );
      db.exec("COMMIT");
      return "inserted";
    }

    if (existing.sourceType !== checkpoint.sourceType) {
      throw new Error(`sourceType cannot change for ${checkpoint.sourceKey}`);
    }

    const checkedComparison = compareExplicitIso8601Instants(
      checkpoint.lastCheckedAt,
      existing.lastCheckedAt,
      "incoming lastCheckedAt",
      "existing lastCheckedAt",
    );
    if (checkedComparison < 0) {
      throw new Error(`source checkpoint cannot move backwards for ${checkpoint.sourceKey}`);
    }
    if (checkedComparison === 0) {
      if (!sameCheckpoint(existing, checkpoint)) {
        throw new Error(`source checkpoint collision at the same lastCheckedAt for ${checkpoint.sourceKey}`);
      }
      db.exec("COMMIT");
      return "unchanged";
    }

    if (existing.lastSuccessAt !== null) {
      if (checkpoint.lastSuccessAt === null) {
        throw new Error(`source checkpoint cannot forget lastSuccessAt for ${checkpoint.sourceKey}`);
      }
      if (
        compareExplicitIso8601Instants(
          checkpoint.lastSuccessAt,
          existing.lastSuccessAt,
          "incoming lastSuccessAt",
          "existing lastSuccessAt",
        ) < 0
      ) {
        throw new Error(`source checkpoint cannot regress lastSuccessAt for ${checkpoint.sourceKey}`);
      }
    }

    db.prepare(`
      UPDATE source_checkpoints
      SET
        cursor_value = ?,
        etag = ?,
        last_modified = ?,
        last_content_hash = ?,
        last_checked_at = ?,
        last_success_at = ?,
        consecutive_failures = ?,
        next_check_at = ?,
        last_error = ?
      WHERE source_key = ?
    `).run(
      checkpoint.cursorValue,
      checkpoint.etag,
      checkpoint.lastModified,
      checkpoint.lastContentHash,
      checkpoint.lastCheckedAt,
      checkpoint.lastSuccessAt,
      checkpoint.consecutiveFailures,
      checkpoint.nextCheckAt,
      checkpoint.lastError,
      checkpoint.sourceKey,
    );
    db.exec("COMMIT");
    return "updated";
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
