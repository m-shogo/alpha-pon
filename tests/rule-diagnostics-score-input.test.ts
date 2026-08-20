import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRuleDiagnosticsScoreRows } from "../src/rule-diagnostics-score-input.js";

type Row = { code: string; createdAt: string; rules?: string[] };

const dir = mkdtempSync(join(tmpdir(), "rule-diagnostics-score-input-"));

try {
  writeFileSync(join(dir, "scores_2026-08-19.json"), JSON.stringify([
    { code: "8136", createdAt: "2026-08-19", rules: ["official_ir"] },
    null,
    { code: "7974", createdAt: "2026-08-19", rules: "broken" },
  ]), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-20.json"), JSON.stringify([
    { code: "7974", createdAt: "2026-08-20", rules: ["earnings"] },
  ]), "utf-8");

  const isolated = readRuleDiagnosticsScoreRows<Row>(dir);
  assert.deepEqual(
    isolated.rows.map(row => `${row.createdAt}_${row.code}`),
    ["2026-08-19_8136", "2026-08-20_7974"],
    "malformed rows must not discard usable historical score evidence",
  );
  assert.deepEqual(
    isolated.warnings,
    ["scores_2026-08-19.json: 2 malformed score row(s) at row(s) 2, 3"],
    "row isolation must leave metadata-only provenance for malformed rows",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify({ code: "broken" }), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-17.json"), "{", "utf-8");
  const fileFailures = readRuleDiagnosticsScoreRows<Row>(dir);
  assert.ok(fileFailures.warnings.includes("scores_2026-08-18.json: invalid_root"));
  assert.ok(fileFailures.warnings.includes("scores_2026-08-17.json: invalid_json"));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("rule-diagnostics-score-input: malformed historical score rows are isolated");
