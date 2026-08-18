import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegimeScenarioReflections } from "../src/regime-scenario-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-regime-input-"));
try {
  const validPath = join(dir, "valid.json");
  const invalidRootPath = join(dir, "invalid-root.json");
  const parseErrorPath = join(dir, "parse-error.json");
  const missingPath = join(dir, "missing.json");

  writeFileSync(validPath, '[{"title":"地震対応","tags":["災害"]}]', "utf-8");
  writeFileSync(invalidRootPath, "{}", "utf-8");
  writeFileSync(parseErrorPath, "{", "utf-8");

  assert.equal(loadRegimeScenarioReflections(validPath)[0]?.title, "地震対応", "valid reflection snapshot remains usable");
  assert.deepEqual(loadRegimeScenarioReflections(missingPath), [], "missing optional reflection history remains a legitimate empty input");
  assert.throws(
    () => loadRegimeScenarioReflections(invalidRootPath),
    /invalid_root/,
    "object root must not silently become a zero-signal regime report",
  );
  assert.throws(
    () => loadRegimeScenarioReflections(parseErrorPath),
    /parse_error/,
    "malformed JSON must not silently become a zero-signal regime report",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("regime scenario input: malformed reflection snapshots fail closed while missing input remains empty");
