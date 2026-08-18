import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./pro-latest-score-row.test.js";
import { latestValuationScoreFile, loadLatestValuationScoreRows } from "../src/valuation-range-input.js";

const dir = mkdtempSync(join(tmpdir(), "valuation-range-input-"));
try {
  writeFileSync(join(dir, "scores_2026-08-17.json"), "[]", "utf-8");
  writeFileSync(join(dir, "scores_2026-08-18.json"), "[]", "utf-8");
  writeFileSync(join(dir, "scores_2026-08-19.json"), "[]", "utf-8");
  writeFileSync(join(dir, "scores_2026-02-31.json"), "[]", "utf-8");

  assert.equal(
    latestValuationScoreFile(dir, "2026-08-18"),
    join(dir, "scores_2026-08-18.json"),
    "valuation range must select the latest score snapshot available by the report as-of date",
  );
  assert.equal(
    latestValuationScoreFile(dir, "2026-08-17"),
    join(dir, "scores_2026-08-17.json"),
    "future score snapshots must not leak into historical/current valuation reports",
  );

  writeFileSync(join(dir, "scores_2026-08-18.json"), "{", "utf-8");
  assert.throws(
    () => loadLatestValuationScoreRows(dir, "2026-08-18"),
    /parse_error/,
    "malformed latest score JSON must not silently produce a zero-row valuation report",
  );
  writeFileSync(join(dir, "scores_2026-08-18.json"), "{}", "utf-8");
  assert.throws(
    () => loadLatestValuationScoreRows(dir, "2026-08-18"),
    /invalid_root/,
    "non-array latest score snapshot must not silently produce a zero-row valuation report",
  );
  writeFileSync(join(dir, "scores_2026-08-18.json"), '[{"code":"8136"}]', "utf-8");
  assert.equal(
    (loadLatestValuationScoreRows<{ code: string }>(dir, "2026-08-18")[0]?.code),
    "8136",
    "valid latest score arrays remain usable",
  );

  rmSync(join(dir, "scores_2026-08-17.json"));
  rmSync(join(dir, "scores_2026-08-18.json"));
  assert.equal(
    latestValuationScoreFile(dir, "2026-08-18"),
    null,
    "future or impossible-date snapshots alone must not become valuation evidence",
  );
  assert.deepEqual(
    loadLatestValuationScoreRows(dir, "2026-08-18"),
    [],
    "missing eligible score snapshots remain a legitimate empty input",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("valuation-range-input: PIT selection and malformed latest score snapshots fail closed OK");
