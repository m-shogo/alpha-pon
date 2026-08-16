import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatJstTimestampDir } from "../src/date.js";
import { assertReadinessBackupDirectoryInput } from "../src/readiness-company-memory-input.js";

assert.equal(
  formatJstTimestampDir(new Date("2026-08-15T15:00:01Z")),
  "2026-08-16T00-00-01",
  "backup directory names must use JST regardless of host timezone",
);

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
  mkdirSync(join(dir, "2026-08-16T11-59-59"));
  assert.doesNotThrow(
    () => assertReadinessBackupDirectoryInput(dir, "2026-08-16", new Date("2026-08-16T12:00:00+09:00")),
    "same-day past backup instants remain valid readiness evidence",
  );

  console.log("readiness-future-backup.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
