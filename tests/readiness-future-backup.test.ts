import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupAgeDaysFromDirectoryName, formatJstTimestampDir } from "../src/date.js";
import { assertReadinessBackupDirectoryInput } from "../src/readiness-company-memory-input.js";

assert.equal(
  formatJstTimestampDir(new Date("2026-08-15T15:00:01Z")),
  "2026-08-16T00-00-01",
  "backup directory names must use JST regardless of host timezone",
);

assert.equal(
  backupAgeDaysFromDirectoryName("2026-08-06T12-00-00", new Date("2026-08-16T12:00:00+09:00")),
  10,
  "backup freshness must be derived from the canonical JST directory timestamp",
);
assert.equal(
  backupAgeDaysFromDirectoryName("2026-08-09T12-00-00", new Date("2026-08-16T12:00:00+09:00")),
  7,
  "a backup exactly seven days old remains inside the readiness freshness boundary",
);

const writeManifest = (path: string) => {
  writeFileSync(join(path, "manifest.json"), JSON.stringify({ createdAt: "2026-08-16T02:59:59.000Z" }), "utf-8");
};

const dir = mkdtempSync(join(tmpdir(), "readiness-future-backup-"));
try {
  mkdirSync(join(dir, "2026-08-17T09-30-00"));
  assert.throws(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    /backup directory date must not be later than readiness as-of date 2026-08-16/,
    "future-dated backup directories must not count as current operations evidence",
  );

  rmSync(join(dir, "2026-08-17T09-30-00"), { recursive: true, force: true });
  mkdirSync(join(dir, "2026-08-16T23-59-59"));
  assert.throws(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    /backup directory timestamp must not be later than current readiness time/,
    "same-day future backup instants must not count as current operations evidence",
  );

  rmSync(join(dir, "2026-08-16T23-59-59"), { recursive: true, force: true });
  const emptyBackup = join(dir, "2026-08-16T11-58-00");
  mkdirSync(emptyBackup);
  const emptyMtime = new Date("2026-08-16T11:58:00+09:00");
  utimesSync(emptyBackup, emptyMtime, emptyMtime);
  assert.throws(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    /timestamped backup evidence must include manifest\.json/,
    "an empty timestamped directory must not count as backup evidence",
  );

  rmSync(emptyBackup, { recursive: true, force: true });
  const legacyBackup = join(dir, "2026-08-16");
  mkdirSync(legacyBackup);
  const legacyMtime = new Date("2026-08-16T00:00:00+09:00");
  utimesSync(legacyBackup, legacyMtime, legacyMtime);
  assert.doesNotThrow(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    "legacy date-only backup directories remain accepted without a manifest",
  );

  rmSync(legacyBackup, { recursive: true, force: true });
  const validBackup = join(dir, "2026-08-16T11-59-59");
  mkdirSync(validBackup);
  writeManifest(validBackup);
  const validMtime = new Date("2026-08-16T11:59:59+09:00");
  utimesSync(validBackup, validMtime, validMtime);
  assert.doesNotThrow(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    "same-day past backup instants with a manifest remain valid readiness evidence",
  );

  rmSync(validBackup, { recursive: true, force: true });
  const staleBackup = join(dir, "2026-08-06T12-00-00");
  mkdirSync(staleBackup);
  writeManifest(staleBackup);
  const touchedNow = new Date("2026-08-16T11:59:00+09:00");
  utimesSync(staleBackup, touchedNow, touchedNow);
  assert.throws(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    /backup freshness must follow the canonical JST directory timestamp, not filesystem mtime/,
    "restoring or touching a stale backup must not make it fresh readiness evidence",
  );

  console.log("readiness-future-backup.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
