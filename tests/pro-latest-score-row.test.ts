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
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("pro-latest-score-row: malformed score rows are isolated with metadata warning OK");
