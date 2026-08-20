import assert from "node:assert/strict";
import test from "node:test";

import { backupHealthEvidenceFromDirectoryNames } from "../src/health/backup-health.js";

const NOW = new Date("2026-08-20T04:00:00.000Z");

test("derives backup freshness from canonical directory timestamps", () => {
  assert.deepEqual(
    backupHealthEvidenceFromDirectoryNames([
      "2026-08-10T12-00-00",
      "2026-08-20T12-30-00",
    ], NOW),
    {
      count: 2,
      latest: "2026-08-20T12-30-00",
      latestAgeDays: 0,
    },
  );
});

test("ignores impossible and future backup directory timestamps", () => {
  assert.deepEqual(
    backupHealthEvidenceFromDirectoryNames([
      "2026-02-31T12-00-00",
      "2026-08-20T13-00-01",
      "2026-08-19T12-00-00",
    ], NOW),
    {
      count: 1,
      latest: "2026-08-19T12-00-00",
      latestAgeDays: 1,
    },
  );
});
