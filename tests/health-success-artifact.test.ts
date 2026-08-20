import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUsableFreshSuccessArtifact } from "../src/health/success-artifact-health.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-health-success-artifact-"));
const today = "2026-08-21";
const todayMtime = new Date("2026-08-20T22:00:00.000Z");
const staleMtime = new Date("2026-08-19T22:00:00.000Z");

try {
  const valid = join(root, "valid.json");
  writeFileSync(valid, "{}\n", "utf8");
  utimesSync(valid, todayMtime, todayMtime);
  assert.equal(isUsableFreshSuccessArtifact(valid, today), true);

  const empty = join(root, "empty.json");
  writeFileSync(empty, "", "utf8");
  utimesSync(empty, todayMtime, todayMtime);
  assert.equal(isUsableFreshSuccessArtifact(empty, today), false);

  const directory = join(root, "artifact.json");
  mkdirSync(directory);
  utimesSync(directory, todayMtime, todayMtime);
  assert.equal(isUsableFreshSuccessArtifact(directory, today), false);

  const stale = join(root, "stale.json");
  writeFileSync(stale, "data", "utf8");
  utimesSync(stale, staleMtime, staleMtime);
  assert.equal(isUsableFreshSuccessArtifact(stale, today), false);

  assert.equal(isUsableFreshSuccessArtifact(join(root, "missing.json"), today), false);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("health-success-artifact.test.ts passed");
