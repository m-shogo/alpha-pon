import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

console.log("pro-latest-score-row: malformed, stale, and duplicate score rows are isolated with metadata warnings OK");
