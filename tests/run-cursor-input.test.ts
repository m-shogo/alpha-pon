import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./hypothesis-open-identity-dedupe.test.js";
import "./hypothesis-outcome-identity-input.test.js";
import { addDaysJst, todayJst } from "../src/date.js";
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
      jobName: "analogy-review",
      offset: 40,
      maxPerRun: 20,
      total: 100,
      updatedAt: todayJst(),
    },
  }), "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "a cursor stored under the wrong job identity must not skip current scan items",
  );

  writeFileSync("data/run-cursors.json", JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: 40,
      maxPerRun: 20,
      total: 100,
      updatedAt: "2026-02-31",
    },
  }), "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "persisted cursors with nonexistent provenance dates must fail closed",
  );

  writeFileSync("data/run-cursors.json", JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: 40,
      maxPerRun: 20,
      total: 100,
      updatedAt: addDaysJst(todayJst(), 1),
    },
  }), "utf-8");
  const future = loadRunCursor("universe-scan", 20, 100);
  assert.equal(
    future.offset,
    0,
    "future cursor provenance must not skip current scan items",
  );
  assert.equal(
    future.updatedAt,
    todayJst(),
    "rejected future cursor provenance must reset to the current JST date",
  );

  writeFileSync("data/run-cursors.json", JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: 40,
      maxPerRun: 20,
      total: 100,
      updatedAt: todayJst(),
    },
  }), "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    40,
    "canonical current-date persisted offsets remain usable",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log("run-cursor-input: malformed roots, identity mismatches, invalid offsets, and future provenance fail closed OK");
