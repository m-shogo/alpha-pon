import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUsableFreshSuccessArtifact } from "../src/health/success-artifact-health.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-health-success-artifact-"));
const today = "2026-08-21";
const now = new Date("2026-08-20T22:30:00.000Z");
const todayMtime = new Date("2026-08-20T22:00:00.000Z");
const futureSameDayMtime = new Date("2026-08-20T23:00:00.000Z");
const staleMtime = new Date("2026-08-19T22:00:00.000Z");

try {
  const valid = join(root, "valid.json");
  writeFileSync(valid, "{}\n", "utf8");
  utimesSync(valid, todayMtime, todayMtime);
  assert.equal(isUsableFreshSuccessArtifact(valid, today, now.getTime()), true);

  const symlinkTarget = join(root, "symlink-target.json");
  writeFileSync(symlinkTarget, "data", "utf8");
  utimesSync(symlinkTarget, todayMtime, todayMtime);
  const symlinkArtifact = join(root, "symlink-artifact.json");
  symlinkSync(symlinkTarget, symlinkArtifact);
  assert.equal(
    isUsableFreshSuccessArtifact(symlinkArtifact, today, now.getTime()),
    false,
    "a symlink must not prove success for the canonical artifact path",
  );

  const futureSameDay = join(root, "future-same-day.json");
  writeFileSync(futureSameDay, "data", "utf8");
  utimesSync(futureSameDay, futureSameDayMtime, futureSameDayMtime);
  assert.equal(isUsableFreshSuccessArtifact(futureSameDay, today, now.getTime()), false);

  const empty = join(root, "empty.json");
  writeFileSync(empty, "", "utf8");
  utimesSync(empty, todayMtime, todayMtime);
  assert.equal(isUsableFreshSuccessArtifact(empty, today, now.getTime()), false);

  const directory = join(root, "artifact.json");
  mkdirSync(directory);
  utimesSync(directory, todayMtime, todayMtime);
  assert.equal(isUsableFreshSuccessArtifact(directory, today, now.getTime()), false);

  const stale = join(root, "stale.json");
  writeFileSync(stale, "data", "utf8");
  utimesSync(stale, staleMtime, staleMtime);
  assert.equal(isUsableFreshSuccessArtifact(stale, today, now.getTime()), false);

  assert.equal(isUsableFreshSuccessArtifact(join(root, "missing.json"), today, now.getTime()), false);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("health-success-artifact.test.ts passed");
