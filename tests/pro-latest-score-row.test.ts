import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLatestProScores } from "../src/pro-latest-score-input.js";

const dir = mkdtempSync(join(tmpdir(), "pro-score-row-"));
try {
  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", name: "Sanrio", warnings: ["valid"] },
    { code: "7974", name: "Nintendo", warnings: {} },
    { code: "4661", name: "OLC", reasons: "broken" },
  ]), "utf-8");

  const result = readLatestProScores<{ code: string; name: string }>(dir, "2026-08-18");
  assert.deepEqual(result.rows.map(row => row.code), ["8136"], "malformed rows must not reach Pro quality consumers");
  assert.equal(result.warnings.length, 1, "malformed rows must remain visible as metadata warnings");
  assert.match(result.warnings[0], /2 malformed score row\(s\).*row\(s\) 2, 3/);
  assert.ok(!result.warnings[0].includes("Nintendo") && !result.warnings[0].includes("OLC"), "warning must not expose raw row content");

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", name: "Sanrio old", warnings: [] },
    { code: "7974", name: "Nintendo", warnings: [] },
    { code: "8136", name: "Sanrio new", warnings: [] },
  ]), "utf-8");

  const duplicate = readLatestProScores<{ code: string; name: string }>(dir, "2026-08-18");
  assert.deepEqual(duplicate.rows.map(row => row.code), ["7974"], "duplicate stable score identities must not reach Pro quality consumers");
  assert.equal(duplicate.warnings.length, 1, "duplicate identities must remain visible as metadata warnings");
  assert.match(duplicate.warnings[0], /2 duplicate-identity score row\(s\).*row\(s\) 1, 3/);
  assert.ok(!duplicate.warnings[0].includes("8136"), "duplicate-identity warning must not expose raw stable identifiers");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("pro-latest-score-row: malformed and duplicate score rows are isolated with metadata warnings OK");
