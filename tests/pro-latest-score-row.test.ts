import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLatestProScores } from "../src/pro-latest-score-input.js";

const dir = mkdtempSync(join(tmpdir(), "pro-score-row-"));
try {
  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", name: "Sanrio", createdAt: "2026-08-18", warnings: ["valid"] },
    { code: "7974", name: "Nintendo", createdAt: "2026-08-18", warnings: {} },
    { code: "4661", name: "OLC", createdAt: "2026-08-18", reasons: "broken" },
    { code: "6501", name: "Hitachi", createdAt: "2026-08-17", warnings: [] },
  ]), "utf-8");

  const linkedTarget = join(dir, "linked-score-target");
  const linkedRoot = join(dir, "linked-score-root");
  mkdirSync(linkedTarget);
  writeFileSync(join(linkedTarget, "scores_2026-08-18.json"), "[]", "utf-8");
  symlinkSync(linkedTarget, linkedRoot);
  assert.throws(
    () => readLatestProScores(linkedRoot, "2026-08-18"),
    /pro-score root must be a real directory/,
    "symlinked score roots must not redirect Pro quality provenance outside the configured reports directory",
  );

  assert.throws(
    () => readLatestProScores(dir, "not-a-date"),
    /pro-score asOf must be a real Gregorian JST date/,
    "invalid direct-call cutoffs must not bypass future score snapshot checks through lexical comparison",
  );
  assert.throws(
    () => readLatestProScores(dir, "2026-02-31"),
    /pro-score asOf must be a real Gregorian JST date/,
    "impossible direct-call cutoffs must fail closed before score selection",
  );

  const result = readLatestProScores<{ code: string; name: string }>(dir, "2026-08-18");
  assert.deepEqual(result.rows.map(row => row.code), ["8136"], "malformed or stale-repackaged rows must not reach Pro quality consumers");
  assert.equal(result.warnings.length, 1, "malformed rows must remain visible as metadata warnings");
  assert.match(result.warnings[0], /3 malformed score row\(s\).*row\(s\) 2, 3, 4/);
  assert.ok(
    !result.warnings[0].includes("Nintendo") && !result.warnings[0].includes("OLC") && !result.warnings[0].includes("Hitachi"),
    "warning must not expose raw row content",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", name: "Sanrio old", createdAt: "2026-08-18", warnings: [] },
    { code: "7974", name: "Nintendo", createdAt: "2026-08-18", warnings: [] },
    { code: "8136", name: "Sanrio new", createdAt: "2026-08-18", warnings: [] },
  ]), "utf-8");

  const duplicate = readLatestProScores<{ code: string; name: string }>(dir, "2026-08-18");
  assert.deepEqual(duplicate.rows.map(row => row.code), ["7974"], "duplicate stable score identities must not reach Pro quality consumers");
  assert.equal(duplicate.warnings.length, 1, "duplicate identities must remain visible as metadata warnings");
  assert.match(duplicate.warnings[0], /2 duplicate-identity score row\(s\).*row\(s\) 1, 3/);
  assert.ok(!duplicate.warnings[0].includes("8136"), "duplicate-identity warning must not expose raw stable identifiers");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("pro-latest-score-row: canonical root, malformed, stale, duplicate, and invalid-cutoff score input is fail-closed OK");
