import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertExistingCompanyMemoryInputs } from "../src/company-memory-existing-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-company-memory-evidence-"));
const path = join(dir, "8136.json");
const valid = {
  schemaVersion: 1,
  code: "8136",
  name: "Sanrio",
  firstSeenAt: "2026-08-01",
  lastReviewedAt: "2026-08-27",
  watchReason: ["Primary disclosure follow-up"],
  knownRisks: [],
  strongRules: [],
  weakRules: [],
  recurringWarnings: [],
  notes: [],
  recentOutcomes: [],
};

writeFileSync(path, JSON.stringify(valid));
assert.doesNotThrow(() => assertExistingCompanyMemoryInputs(dir, "2026-08-27"));

for (const bad of ["", "   ", " padded "] as const) {
  writeFileSync(path, JSON.stringify({ ...valid, watchReason: [bad] }));
  assert.throws(
    () => assertExistingCompanyMemoryInputs(dir, "2026-08-27"),
    /watchReason must be an array of canonical non-empty strings/,
    "blank or padded strings must not count as company-memory evidence",
  );
}

console.log("company-memory existing input: blank/padded evidence strings fail closed OK");
