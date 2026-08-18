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

console.log("proposals-score-input: future and impossible score snapshots stay outside current proposals OK");
