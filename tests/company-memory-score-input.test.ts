import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCompanyMemoryScoreInputs } from "../src/company-memory-score-input.js";

const dir = mkdtempSync(join(tmpdir(), "company-memory-score-input-"));
try {
  const validRow = { code: "8136", name: "Sanrio", createdAt: "2026-08-17" };
  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([validRow]));
  assert.doesNotThrow(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    "current canonical score evidence remains valid company-memory input",
  );

  const futureSnapshot = join(dir, "scores_2026-08-18.json");
  writeFileSync(futureSnapshot, JSON.stringify([{ ...validRow, createdAt: "2026-08-18" }]));
  assert.throws(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    /score snapshot filename must not be later than company-memory as-of date 2026-08-17/,
    "future score snapshots must not become current company-memory evidence",
  );
  rmSync(futureSnapshot);

  const impossibleSnapshot = join(dir, "scores_2026-02-31.json");
  writeFileSync(impossibleSnapshot, JSON.stringify([validRow]));
  assert.throws(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    /score snapshot filename must contain a real Gregorian date/,
    "impossible score snapshot dates must fail closed",
  );
  rmSync(impossibleSnapshot);

  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([{ ...validRow, createdAt: "2026-08-18" }]));
  assert.throws(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    /createdAt must not be later than company-memory as-of date 2026-08-17/,
    "future row provenance must not outrank current company-memory evidence",
  );

  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([{ ...validRow, createdAt: "2026-02-31" }]));
  assert.throws(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    /createdAt must be a real Gregorian JST date/,
    "impossible row provenance dates must fail closed",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("company-memory-score-input: score snapshot and row PIT cutoff OK");
