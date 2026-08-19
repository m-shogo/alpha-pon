import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertExistingCompanyMemoryInputs } from "../src/company-memory-existing-input.js";
import { assertCompanyMemoryScoreInputs } from "../src/company-memory-score-input.js";

const dir = mkdtempSync(join(tmpdir(), "company-memory-score-input-"));
try {
  const validRow = { code: "8136", name: "Sanrio", createdAt: "2026-08-17" };
  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([validRow]));
  assert.doesNotThrow(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    "current canonical score evidence remains valid company-memory input",
  );

  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([{ ...validRow, code: "8136 " }]));
  assert.throws(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    /code must be canonical without surrounding whitespace/,
    "padded company codes must not fork company-memory identity or filesystem provenance",
  );

  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([
    validRow,
    { ...validRow, name: "Conflicting duplicate" },
  ]));
  assert.throws(
    () => assertCompanyMemoryScoreInputs(dir, "2026-08-17"),
    /duplicate company code 8136/,
    "duplicate daily score identities must not make company-memory provenance depend on row order",
  );

  const futureSnapshot = join(dir, "scores_2026-08-18.json");
  writeFileSync(join(dir, "scores_2026-08-17.json"), JSON.stringify([validRow]));
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

  const memoryDir = join(dir, "existing");
  mkdirSync(memoryDir);
  writeFileSync(join(memoryDir, " 8136.json"), JSON.stringify({
    schemaVersion: 1,
    code: " 8136",
    name: "Sanrio",
    firstSeenAt: "2026-08-01",
    lastReviewedAt: "2026-08-17",
    watchReason: [],
    knownRisks: [],
    strongRules: [],
    weakRules: [],
    recurringWarnings: [],
    recentOutcomes: [],
    notes: [],
  }));
  assert.throws(
    () => assertExistingCompanyMemoryInputs(memoryDir),
    /code must not have surrounding whitespace/,
    "padded existing-memory filenames and codes must not fork filesystem identity",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("company-memory-score-input: score snapshot and row PIT cutoff OK");
