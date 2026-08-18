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

console.log("proposals-score-input: PIT, warning-shape, required-identity, and duplicate-identity regressions OK");
