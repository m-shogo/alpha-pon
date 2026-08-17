import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readGeneratedCompanyRules } from "../src/pro-generated-rules-input.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-pro-generated-rules-"));
try {
  const path = join(dir, "generated_company_rules_latest.json");
  writeFileSync(path, JSON.stringify({ generatedAt: "2026-08-17", rules: [{ code: "8136" }] }), "utf-8");
  const valid = readGeneratedCompanyRules<Record<string, unknown>>(path, "2026-08-17");
  assert(valid.rows.length === 1 && valid.generatedAt === "2026-08-17", "current generated rules evidence must remain usable");

  writeFileSync(path, "{not-json", "utf-8");
  let parseRejected = false;
  try { readGeneratedCompanyRules(path, "2026-08-17"); } catch (error) {
    parseRejected = error instanceof Error && /must contain valid JSON/.test(error.message);
  }
  assert(parseRejected, "malformed generated rules must not become empty valuation evidence");

  writeFileSync(path, JSON.stringify([]), "utf-8");
  let rootRejected = false;
  try { readGeneratedCompanyRules(path, "2026-08-17"); } catch (error) {
    rootRejected = error instanceof Error && /root must be an object/.test(error.message);
  }
  assert(rootRejected, "non-object generated rules root must fail closed");

  writeFileSync(path, JSON.stringify({ generatedAt: "2026-08-17", rules: {} }), "utf-8");
  let rulesRejected = false;
  try { readGeneratedCompanyRules(path, "2026-08-17"); } catch (error) {
    rulesRejected = error instanceof Error && /rules must be an array/.test(error.message);
  }
  assert(rulesRejected, "non-array generated rules field must fail closed");

  writeFileSync(path, JSON.stringify({ generatedAt: "2026-02-31", rules: [] }), "utf-8");
  let dateRejected = false;
  try { readGeneratedCompanyRules(path, "2026-08-17"); } catch (error) {
    dateRejected = error instanceof Error && /real Gregorian JST date/.test(error.message);
  }
  assert(dateRejected, "impossible generatedAt must fail closed");

  writeFileSync(path, JSON.stringify({ generatedAt: "2026-08-18", rules: [] }), "utf-8");
  let futureRejected = false;
  try { readGeneratedCompanyRules(path, "2026-08-17"); } catch (error) {
    futureRejected = error instanceof Error && /must not be later than Pro valuation as-of date/.test(error.message);
  }
  assert(futureRejected, "future generated rules must not become current valuation evidence");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("pro generated rules input tests passed");
