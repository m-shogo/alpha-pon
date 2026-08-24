import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProposalScores } from "../src/proposals-score-input.js";

const dir = mkdtempSync(join(tmpdir(), "proposals-score-input-"));
try {
  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([{ code: "previous" }]), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([{ code: "current" }]), "utf-8");
  writeFileSync(join(dir, "scores_2026-08-19.json"), JSON.stringify([{ code: "future" }]), "utf-8");
  writeFileSync(join(dir, "scores_2026-02-31.json"), JSON.stringify([{ code: "impossible" }]), "utf-8");

  const current = readProposalScores<{ code: string }>(dir, "2026-08-18");
  assert.deepEqual(current.rows, [{ code: "current" }]);
  assert.equal(current.sourceFile, join(dir, "scores_2026-08-18.json"));

  writeFileSync(join(dir, "scores_2026-08-18.json"), "{", "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string }>(dir, "2026-08-18"),
    /proposal score snapshot must contain valid JSON/,
    "malformed score JSON must not be treated as a legitimate zero-score day",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify({ code: "8136" }), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string }>(dir, "2026-08-18"),
    /proposal score root must be an array/,
    "a malformed score snapshot root must not be treated as a legitimate zero-score day",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [] },
    { code: "7974", warnings: {} },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string; warnings?: string[] }>(dir, "2026-08-18"),
    /proposal score warning shape is invalid at row\(s\) 2/,
    "unsafe warning shapes must fail closed before proposal consumers call Array.some",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [], dataQuality: "ok" },
    { code: "7974", warnings: [], dataQuality: "perfect" },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string; dataQuality?: string }>(dir, "2026-08-18"),
    /proposal score data quality is invalid at row\(s\) 2/,
    "producer-outside data quality must not suppress missing or partial proposal ratios",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [], primaryDisclosureReview: "broken" },
    {
      code: "7974",
      warnings: [],
      primaryDisclosureReview: { decision: "confirmed", sourceCoverage: { fetchErrorCount: "oops" } },
    },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string }>(dir, "2026-08-18"),
    /proposal score primary disclosure review shape is invalid at row\(s\) 1, 2/,
    "malformed primary review evidence must not inflate review coverage or hide fetch errors",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [], marketContext: "broken" },
    { code: "7974", warnings: [], financialQuality: [] },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string }>(dir, "2026-08-18"),
    /proposal score context shape is invalid at row\(s\) 1, 2/,
    "malformed context values must not count as available market or financial evidence",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [], createdAt: "2026-08-17" },
    { code: "7974", warnings: [], createdAt: "2026-08-18" },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string; createdAt?: string }>(dir, "2026-08-18"),
    /proposal score createdAt is inconsistent with snapshot at row\(s\) 1/,
    "declared score provenance must remain bound to the dated snapshot instead of allowing stale rows to be repackaged",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    {
      code: "8136",
      warnings: [],
      dataQuality: "partial",
      marketContext: {},
      financialQuality: {},
      primaryDisclosureReview: { decision: "confirmed", sourceCoverage: { fetchErrorCount: 0 } },
    },
  ]), "utf-8");
  assert.deepEqual(
    readProposalScores<{ code: string }>(dir, "2026-08-18").rows.map(row => row.code),
    ["8136"],
    "canonical data quality, object context, and primary review evidence remain usable",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [] },
    { warnings: [] },
    { code: " 7974", warnings: [] },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code?: string; warnings?: string[] }>(dir, "2026-08-18"),
    /proposal score identity is invalid at row\(s\) 2, 3/,
    "missing or non-canonical score identities must not inflate proposal counts or ratios",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), JSON.stringify([
    { code: "8136", warnings: [] },
    { code: "7974", warnings: [] },
    { code: "8136", warnings: [] },
  ]), "utf-8");
  assert.throws(
    () => readProposalScores<{ code: string; warnings?: string[] }>(dir, "2026-08-18"),
    /proposal score identity is duplicated at row\(s\) 1, 3/,
    "duplicate stable score identities must not inflate proposal counts or ratios",
  );

  const historical = readProposalScores<{ code: string }>(dir, "2026-08-17");
  assert.deepEqual(historical.rows, [{ code: "previous" }]);
  assert.equal(historical.sourceFile, join(dir, "scores_2026-08-17.json"));

  rmSync(join(dir, "scores_2026-08-17.json"));
  rmSync(join(dir, "scores_2026-08-18.json"));
  const unavailable = readProposalScores<{ code: string }>(dir, "2026-08-18");
  assert.deepEqual(unavailable.rows, []);
  assert.equal(unavailable.sourceFile, null);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("proposals-score-input: PIT, parse-error, root-shape, warning-shape, data-quality, primary-review-shape, context-shape, createdAt-lineage, required-identity, and duplicate-identity regressions OK");
