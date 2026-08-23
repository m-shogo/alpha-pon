import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReadinessBackupDirectoryInput } from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-backup-symlink-"));
try {
  const backupsDir = join(dir, "backups");
  const targetDir = join(dir, "real-backup-target");
  mkdirSync(backupsDir);
  mkdirSync(targetDir);

  symlinkSync(targetDir, join(backupsDir, "2026-08-16T09-30-00"), "dir");

  assert.throws(
    () => assertReadinessBackupDirectoryInput(
      backupsDir,
      "2026-08-23",
      new Date("2026-08-23T15:00:00+09:00"),
    ),
    /backup evidence candidate must be a directory/,
    "symlinked directories must not qualify as canonical backup evidence",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-backup-symlink.test.ts passed");
