import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { backupHealthEvidenceFromDirectoryNames } from "../src/health/backup-health.js";

const NOW = new Date("2026-08-20T04:00:00.000Z");

function withBackupRoot(run: (root: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "health-backup-"));
  const root = join(dir, "backups");
  mkdirSync(root);
  try {
    run(root);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("derives backup freshness from canonical directory timestamps", () => {
  withBackupRoot((root) => {
    const names = [
      "2026-08-10T12-00-00",
      "2026-08-20T12-30-00",
    ];
    for (const name of names) mkdirSync(join(root, name));

    assert.deepEqual(
      backupHealthEvidenceFromDirectoryNames(names, NOW, root),
      {
        count: 2,
        latest: "2026-08-20T12-30-00",
        latestAgeDays: 0,
      },
    );
  });
});

test("ignores impossible and future backup directory timestamps", () => {
  withBackupRoot((root) => {
    const names = [
      "2026-02-31T12-00-00",
      "2026-08-20T13-00-01",
      "2026-08-19T12-00-00",
    ];
    for (const name of names) mkdirSync(join(root, name));

    assert.deepEqual(
      backupHealthEvidenceFromDirectoryNames(names, NOW, root),
      {
        count: 1,
        latest: "2026-08-19T12-00-00",
        latestAgeDays: 1,
      },
    );
  });
});

test("ignores timestamp-shaped files and symlinks", () => {
  withBackupRoot((root) => {
    const realName = "2026-08-18T12-00-00";
    const fileName = "2026-08-19T12-00-00";
    const symlinkName = "2026-08-20T12-00-00";
    const target = join(root, "real-target");

    mkdirSync(join(root, realName));
    writeFileSync(join(root, fileName), "not a backup directory\n");
    mkdirSync(target);
    symlinkSync(target, join(root, symlinkName), "dir");

    assert.deepEqual(
      backupHealthEvidenceFromDirectoryNames(
        [realName, fileName, symlinkName],
        NOW,
        root,
      ),
      {
        count: 1,
        latest: realName,
        latestAgeDays: 2,
      },
    );
  });
});
