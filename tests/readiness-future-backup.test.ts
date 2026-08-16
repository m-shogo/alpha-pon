import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReadinessBackupDirectoryInput } from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-future-backup-"));
try {
  mkdirSync(join(dir, "2026-08-17T09-30-00"));
  assert.throws(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16"),
    /backup directory date must not be later than readiness as-of date 2026-08-16/,
    "future-dated backup directories must not count as current operations evidence",
  );

  rmSync(join(dir, "2026-08-17T09-30-00"), { recursive: true, force: true });
  mkdirSync(join(dir, "2026-08-16T23-59-59"));
  assert.doesNotThrow(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16"),
    "same-day backup directories remain valid readiness evidence",
  );

  console.log("readiness-future-backup.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
