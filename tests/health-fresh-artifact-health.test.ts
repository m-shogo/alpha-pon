import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUsableFreshArtifact } from "../src/health/fresh-artifact-health.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-health-artifact-"));
try {
  const today = "2026-08-21";
  const fresh = join(root, "fresh.md");
  const blank = join(root, "blank.md");
  const directory = join(root, "dir");
  const stale = join(root, "stale.md");

  writeFileSync(fresh, "ok\n", "utf8");
  writeFileSync(blank, "", "utf8");
  mkdirSync(directory);
  writeFileSync(stale, "old\n", "utf8");

  const freshMtime = new Date("2026-08-21T01:00:00+09:00");
  const staleMtime = new Date("2026-08-20T23:59:59+09:00");
  utimesSync(fresh, freshMtime, freshMtime);
  utimesSync(blank, freshMtime, freshMtime);
  utimesSync(directory, freshMtime, freshMtime);
  utimesSync(stale, staleMtime, staleMtime);

  assert.equal(isUsableFreshArtifact(fresh, today), true, "non-empty readable regular file from today should be usable");
  assert.equal(isUsableFreshArtifact(blank, today), false, "blank file must not prove job success");
  assert.equal(isUsableFreshArtifact(directory, today), false, "directory must not prove job success");
  assert.equal(isUsableFreshArtifact(stale, today), false, "stale file must not prove current job success");
  assert.equal(isUsableFreshArtifact(join(root, "missing.md"), today), false, "missing artifact must fail closed");

  if (process.platform !== "win32") {
    const unreadable = join(root, "unreadable.md");
    writeFileSync(unreadable, "secret\n", "utf8");
    utimesSync(unreadable, freshMtime, freshMtime);
    chmodSync(unreadable, 0o000);
    try {
      assert.equal(isUsableFreshArtifact(unreadable, today), false, "unreadable file must not prove job success");
    } finally {
      chmodSync(unreadable, 0o600);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
