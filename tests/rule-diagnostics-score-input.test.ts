import assert from "node:assert/strict";
import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRuleDiagnosticsScoreRows } from "../src/rule-diagnostics-score-input.js";

type Row = { code: string; createdAt: string; rules?: string[] };

const dir = mkdtempSync(join(tmpdir(), "rule-diagnostics-score-input-"));

try {
  writeFileSync(join(dir, "scores_2026-08-16.json"), JSON.stringify([
    { code: "6501", createdAt: "2026-08-16", rules: ["first"] },
    { code: "6501", createdAt: "2026-08-16", rules: ["second"] },
  ]), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-19.json"), JSON.stringify([
    { code: "8136", createdAt: "2026-08-19", rules: ["official_ir"] },
    null,
    { code: "7974", createdAt: "2026-08-19", rules: "broken" },
  ]), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-20.json"), JSON.stringify([
    { code: "7974", createdAt: "2026-08-20", rules: ["earnings"] },
    { code: "8136", createdAt: "2026-08-19", rules: ["future_repackaged"] },
  ]), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-21.json"), JSON.stringify([
    { code: "4661", createdAt: "2026-08-21", rules: ["future"] },
  ]), "utf-8");
  writeFileSync(join(dir, "scores_2026-02-31.json"), JSON.stringify([
    { code: "6501", createdAt: "2026-02-31", rules: ["impossible"] },
  ]), "utf-8");

  assert.throws(
    () => readRuleDiagnosticsScoreRows<Row>(dir, "not-a-date"),
    /rule-diagnostics score asOf must be a real Gregorian JST date/,
    "invalid direct-call cutoffs must not bypass future snapshot isolation through lexical comparison",
  );
  assert.throws(
    () => readRuleDiagnosticsScoreRows<Row>(dir, "2026-02-31"),
    /rule-diagnostics score asOf must be a real Gregorian JST date/,
    "impossible direct-call cutoffs must fail closed before score aggregation",
  );

  const isolated = readRuleDiagnosticsScoreRows<Row>(dir, "2026-08-20");
  assert.deepEqual(
    isolated.rows.map(row => `${row.createdAt}_${row.code}`),
    ["2026-08-19_8136", "2026-08-20_7974"],
    "current/past snapshots must not admit ambiguous identities, malformed rows, future snapshots, or rows repackaged under another snapshot date",
  );
  assert.ok(isolated.warnings.includes("scores_2026-08-16.json: 2 malformed score row(s) at row(s) 1, 2"));
  assert.ok(isolated.warnings.includes("scores_2026-08-19.json: 2 malformed score row(s) at row(s) 2, 3"));
  assert.ok(isolated.warnings.includes("scores_2026-08-20.json: 1 malformed score row(s) at row(s) 2"));
  assert.ok(isolated.warnings.includes("scores_2026-08-21.json: future_snapshot"));
  assert.ok(isolated.warnings.includes("scores_2026-02-31.json: invalid_snapshot_date"));

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify({ code: "broken" }), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-17.json"), "{", "utf-8");

  const symlinkTarget = join(dir, "symlink-target.json");
  writeFileSync(symlinkTarget, JSON.stringify([{ code: "9432", createdAt: "2026-08-15", rules: ["linked"] }]), "utf-8");
  symlinkSync(symlinkTarget, join(dir, "scores_2026-08-15.json"));

  const hardLinkTarget = join(dir, "hardlink-target.json");
  writeFileSync(hardLinkTarget, JSON.stringify([{ code: "9984", createdAt: "2026-08-14", rules: ["linked"] }]), "utf-8");
  linkSync(hardLinkTarget, join(dir, "scores_2026-08-14.json"));

  const fileFailures = readRuleDiagnosticsScoreRows<Row>(dir, "2026-08-20");
  assert.ok(fileFailures.warnings.includes("scores_2026-08-18.json: invalid_root"));
  assert.ok(fileFailures.warnings.includes("scores_2026-08-17.json: invalid_json"));
  assert.ok(fileFailures.warnings.includes("scores_2026-08-15.json: invalid_json"));
  assert.ok(fileFailures.warnings.includes("scores_2026-08-14.json: invalid_json"));
  assert.ok(!fileFailures.rows.some(row => row.code === "9432" || row.code === "9984"), "linked score evidence must not enter diagnostics");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("rule-diagnostics-score-input: ambiguous, malformed, PIT-inconsistent, linked, and invalid-cutoff score evidence is isolated");
