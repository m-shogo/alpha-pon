import assert from "node:assert/strict";
import "./company-network-peer-identity.test.js";
import "./market-event-lifecycle-instant.test.js";
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCanonicalGeneratedJsonFile } from "../apps/web/lib/generated-api-file.js";
import { freshnessOf } from "../src/data-freshness.js";
import { backupHealthEvidenceFromDirectoryNames } from "../src/health/backup-health.js";
import {
  assertReadinessBackupDirectoryInput,
  assertReadinessDataQualityFallbackInput,
  assertReadinessPrimaryDisclosureReviewInput,
  assertReadinessScoreSnapshotIdentityInput,
} from "../src/readiness-company-memory-input.js";

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

  const linkedRootTarget = join(dir, "linked-backups-target");
  const linkedRoot = join(dir, "linked-backups");
  mkdirSync(linkedRootTarget);
  mkdirSync(join(linkedRootTarget, "2026-08-22T09-30-00"));
  symlinkSync(linkedRootTarget, linkedRoot, "dir");

  assert.deepEqual(
    backupHealthEvidenceFromDirectoryNames(
      ["2026-08-22T09-30-00"],
      new Date("2026-08-23T06:00:00.000Z"),
      linkedRoot,
    ),
    {
      count: 0,
      latest: null,
      latestAgeDays: null,
    },
    "a symlinked backup root must not qualify as canonical backup evidence",
  );

  const reportsDir = join(dir, "reports");
  const generatedPath = join(dir, "alpha-pon-data.json");
  mkdirSync(reportsDir);
  writeFileSync(
    join(reportsDir, "scores_2026-08-16.json"),
    JSON.stringify([{ code: "8136", name: "Sanrio", dataQuality: "perfect" }]),
  );
  writeFileSync(
    generatedPath,
    JSON.stringify({ dataQualityByCode: { "8136": { warnings: { count: 3 } } } }),
  );

  assert.throws(
    () => assertReadinessScoreSnapshotIdentityInput(reportsDir, "2026-08-16"),
    /valid source-health metadata/,
    "malformed score metadata must fail closed before readiness treats a snapshot as canonical evidence",
  );
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir, "2026-08-16"),
    /warnings must be a string array/,
    "malformed score metadata must not suppress validation of the generated fallback",
  );

  const confirmedReview = {
    decision: "confirmed",
    sourceCoverage: { tdnetCount: 1, edinetCount: 0 },
  };
  writeFileSync(
    generatedPath,
    JSON.stringify({
      primaryDisclosureReviews: {
        "8136": confirmedReview,
        " 8136": confirmedReview,
        "8136 ": confirmedReview,
      },
    }),
  );
  assert.throws(
    () => assertReadinessPrimaryDisclosureReviewInput(generatedPath),
    /keys must be canonical non-empty company codes/,
    "padded primary-review keys must not inflate the number of companies with primary-disclosure evidence",
  );

  const canonicalGenerated = join(dir, "canonical-generated.json");
  writeFileSync(canonicalGenerated, JSON.stringify({ status: "ok" }));
  assert.deepEqual(
    readCanonicalGeneratedJsonFile(canonicalGenerated),
    { status: "ok" },
    "standalone regular generated JSON must remain readable",
  );

  const freshnessTarget = join(dir, "freshness-target.json");
  writeFileSync(freshnessTarget, JSON.stringify({ status: "ok" }));
  const freshnessHardlink = join(dir, "freshness-hardlink.json");
  linkSync(freshnessTarget, freshnessHardlink);
  const freshnessHardlinkResult = freshnessOf(freshnessHardlink, "freshness hardlink");
  assert.equal(freshnessHardlinkResult.exists, true, "existing hard link remains distinguishable from a missing path");
  assert.equal(
    freshnessHardlinkResult.isFreshToday,
    false,
    "hard-linked report mtime must not qualify as canonical fresh evidence",
  );
  assert.match(freshnessHardlinkResult.reason, /standalone regular fileではない/);

  const generatedSymlink = join(dir, "generated-symlink.json");
  symlinkSync(canonicalGenerated, generatedSymlink, "file");
  assert.throws(
    () => readCanonicalGeneratedJsonFile(generatedSymlink),
    /standalone regular file/,
    "symlinked generated JSON must not qualify as canonical API evidence",
  );

  const generatedHardlink = join(dir, "generated-hardlink.json");
  linkSync(canonicalGenerated, generatedHardlink);
  assert.throws(
    () => readCanonicalGeneratedJsonFile(generatedHardlink),
    /standalone regular file/,
    "hard-linked generated JSON must not qualify as canonical API evidence",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-backup-symlink.test.ts passed");