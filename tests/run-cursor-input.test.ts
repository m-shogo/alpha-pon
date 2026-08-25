import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./hypothesis-open-identity-dedupe.test.js";
import "./hypothesis-outcome-identity-input.test.js";
import { addDaysJst, todayJst } from "../src/date.js";
import { loadRunCursor, saveRunCursor } from "../src/run-cursor.js";

const originalCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "run-cursor-input-"));

try {
  process.chdir(dir);
  mkdirSync("data", { recursive: true });

  for (const [maxPerRun, total] of [
    [Number.NaN, 100],
    [0, 100],
    [1.5, 100],
    [20, -1],
    [20, 1.5],
    [20, Number.MAX_SAFE_INTEGER + 1],
  ] as Array<[number, number]>) {
    assert.throws(
      () => loadRunCursor("universe-scan", maxPerRun, total),
      /run cursor (maxPerRun|total) must be/,
      "invalid caller parameters must fail visibly instead of producing an empty or corrupt cursor run",
    );
  }
  assert.throws(
    () => saveRunCursor({ jobName: "universe-scan", offset: 0, maxPerRun: Number.NaN, total: 100, updatedAt: todayJst() }),
    /run cursor maxPerRun must be/,
    "invalid persisted cursor parameters must not be written",
  );

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

  const canonicalCursor = JSON.stringify({
    "universe-scan": {
      jobName: "universe-scan",
      offset: 40,
      maxPerRun: 20,
      total: 100,
      updatedAt: todayJst(),
    },
  });
  writeFileSync("cursor-target.json", canonicalCursor, "utf-8");
  rmSync("data/run-cursors.json", { force: true });
  symlinkSync("../cursor-target.json", "data/run-cursors.json");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "symlinked cursor state must not skip active scan items",
  );
  const savedFromSymlink = saveRunCursor({
    jobName: "universe-scan",
    offset: 0,
    maxPerRun: 20,
    total: 100,
    updatedAt: todayJst(),
  });
  assert.equal(savedFromSymlink.offset, 20, "cursor progress remains writable after rejecting a symlink alias");
  assert.equal(
    readFileSync("cursor-target.json", "utf-8"),
    canonicalCursor,
    "saving cursor state must not follow and overwrite a symlink target",
  );
  assert.equal(loadRunCursor("universe-scan", 20, 100).offset, 20, "symlink alias is replaced by canonical cursor state");

  rmSync("data/run-cursors.json", { force: true });
  writeFileSync("hardlink-target.json", canonicalCursor, "utf-8");
  linkSync("hardlink-target.json", "data/run-cursors.json");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    0,
    "hard-linked cursor state must not be accepted as canonical operational provenance",
  );
  const savedFromHardlink = saveRunCursor({
    jobName: "universe-scan",
    offset: 20,
    maxPerRun: 20,
    total: 100,
    updatedAt: todayJst(),
  });
  assert.equal(savedFromHardlink.offset, 40, "cursor progress remains writable after rejecting a hard-link alias");
  assert.equal(
    readFileSync("hardlink-target.json", "utf-8"),
    canonicalCursor,
    "saving cursor state must not overwrite the aliased hard-link inode",
  );
  assert.equal(loadRunCursor("universe-scan", 20, 100).offset, 40, "hard-link alias is replaced by canonical cursor state");

  rmSync("data/run-cursors.json", { force: true });
  writeFileSync("data/run-cursors.json", canonicalCursor, "utf-8");
  assert.equal(
    loadRunCursor("universe-scan", 20, 100).offset,
    40,
    "canonical current-date persisted offsets remain usable",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log("run-cursor-input: malformed roots, caller parameters, identity mismatches, invalid offsets, linked read/write paths, and future provenance fail closed OK");
