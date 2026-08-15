import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReadinessCompanyMemoryInput } from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-company-memory-"));
try {
  const generatedPath = join(dir, "alpha-pon-data.json");
  const reportPath = join(dir, "company_memory_latest.json");

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: [] }));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  writeFileSync(generatedPath, JSON.stringify({ companyMemory: {} }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /companyMemory must be an array when present/,
    "malformed generated companyMemory must fail closed instead of becoming a false zero-record readiness state",
  );

  writeFileSync(generatedPath, JSON.stringify({}));
  writeFileSync(reportPath, JSON.stringify([{ code: "8136" }]));
  assert.doesNotThrow(() => assertReadinessCompanyMemoryInput(generatedPath, reportPath));

  writeFileSync(reportPath, JSON.stringify({ code: "8136" }));
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /company-memory root must be an array/,
    "malformed fallback company-memory root must fail closed before readiness scoring",
  );

  writeFileSync(generatedPath, "{ broken");
  assert.throws(
    () => assertReadinessCompanyMemoryInput(generatedPath, reportPath),
    /invalid JSON/,
    "malformed generated readiness JSON must not be treated as missing input",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("readiness-company-memory-input.test.ts passed");
