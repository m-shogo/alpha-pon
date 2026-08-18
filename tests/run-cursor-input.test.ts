import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRunCursor } from "../src/run-cursor.js";

const originalCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "run-cursor-input-"));

try {
  process.chdir(dir);
  mkdirSync("data", { recursive: true });

  writeFileSync("data/run-cursors.json", "null", "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "JSON-valid non-object cursor roots must fail closed instead of crashing an active scan",
  );

  writeFileSync("data/run-cursors.json", JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: -1,
      maxPerRun: 20,
      total: 100,
      updatedAt: "2026-08-18",
    },
  }), "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "negative persisted offsets must not reach Array.slice as valid cursor state",
  );

  writeFileSync("data/run-cursors.json", JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: 1.5,
      maxPerRun: 20,
      total: 100,
      updatedAt: "2026-08-18",
    },
  }), "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "fractional persisted offsets must fail closed",
  );

  writeFileSync("data/run-cursors.json", JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: 40,
      maxPerRun: 20,
      total: 100,
      updatedAt: "2026-08-18",
    },
  }), "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    40,
    "canonical persisted offsets remain usable",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log("run-cursor-input: malformed root and invalid persisted offsets fail closed OK");
