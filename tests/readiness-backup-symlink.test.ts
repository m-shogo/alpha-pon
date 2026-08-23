import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupHealthEvidenceFromDirectoryNames } from "../src/health/backup-health.js";
import { assertReadinessBackupDirectoryInput } from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-backup-symlink-"));
try {
  const backupsDir = join(dir, "backups");
  const targetDir = join(dir, "real-backup-target");
  mkdirSync(backupsDir);
  mkdirSync(targetDir);

  const symlinkName = "2026-08-16T09-30-00";
  symlinkSync(targetDir, join(backupsDir, symlinkName), "dir");

  assert.throws(
    () => assertReadinessBackupDirectoryInput(
      backupsDir,
      "2026-08-23",
      new Date("2026-08-23T15:00:00+09:00"),
    ),
    /backup evidence candidate must be a directory/,
    "symlinked directories must not qualify as canonical backup evidence",
  );

  const realName = "2026-08-15T09-30-00";
  const fileName = "2026-08-17T09-30-00";
  mkdirSync(join(backupsDir, realName));
  writeFileSync(join(backupsDir, fileName), "not a backup directory\n");

  assert.deepEqual(
    backupHealthEvidenceFromDirectoryNames(
      [realName, symlinkName, fileName],
      new Date("2026-08-23T06:00:00.000Z"),
      backupsDir,
    ),
    {
      count: 1,
      latest: realName,
      latestAgeDays: 8,
    },
    "health backup evidence must ignore timestamp-shaped files and symlinks",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-backup-symlink.test.ts passed");
