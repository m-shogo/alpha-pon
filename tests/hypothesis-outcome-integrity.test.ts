import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { partitionHypothesesByDetectedAt } from "../src/hypothesis-review-date.js";
import {
  buildOutcomeIntegrityReport,
  isBlockingOutcomeIntegrityStatus,
} from "../src/hypothesis-outcome-integrity.js";
import type { HypothesisOutcome } from "../src/universe.js";

function outcome(code: string, detectedAt: string, reviewHorizon: "1d" | "1w" | "1m"): HypothesisOutcome {
  return {
    schemaVersion: 1,
    code,
    name: code,
    hypothesis: {
      schemaVersion: 1,
      code,
      name: code,
      detectedAt,
      reviewDueAt: detectedAt,
      reason: "test",
      expectedTimeframe: "1m",
      expectedDirection: "up",
      confidence: 0.5,
      invalidationSignals: [],
      evidenceNeeded: [],
      relatedWorldEventIds: [],
      relatedDisclosureIds: [],
      status: "open",
      label: "検証候補",
    },
    evaluatedAt: detectedAt,
    reviewHorizon,
    actionLabel: "log",
    scoreAtPrediction: 50,
    startPrice: null,
    endPrice1d: null,
    endPrice1w: null,
    endPrice1m: null,
    endPrice3m: null,
    return1d: null,
    return1w: null,
    return1m: null,
    return3m: null,
    topixReturn1d: null,
    benchmarkReturn1w: null,
    benchmarkReturn3m: null,
    topixReturn1m: null,
    relativeToTopix1d: null,
    relativeToTopix1w: null,
    relativeToTopix1m: null,
    relativeToTopix3m: null,
    maxDrawdownPct: null,
    actualDirection: "unknown",
    result: "unknown",
    dataAvailability: "missing",
    whatMatched: [],
    whatDiffered: [],
    missedSignals: [],
    improvedRuleIdeas: [],
    notes: "test",
    dataSource: "mock",
  };
}

{
  const partitioned = partitionHypothesesByDetectedAt([
    { id: "valid", detectedAt: "2026-06-01" },
    { id: "impossible", detectedAt: "2026-02-31" },
    { id: "year-zero", detectedAt: "0000-01-01" },
    { id: "missing", detectedAt: undefined },
  ]);
  assert.deepEqual(partitioned.valid.map(row => row.id), ["valid"]);
  assert.deepEqual(partitioned.invalid.map(row => row.id), ["impossible", "year-zero", "missing"]);
}

assert.equal(isBlockingOutcomeIntegrityStatus("ok"), false);
assert.equal(isBlockingOutcomeIntegrityStatus("duplicate_found"), true);
assert.equal(isBlockingOutcomeIntegrityStatus("parse_error"), true);
assert.equal(isBlockingOutcomeIntegrityStatus("db_unavailable"), true, "DB監査不能を成功終了させない");

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-outcomes-"));
try {
  const jsonlPath = join(dir, "hypothesis_outcomes.jsonl");
  const dbPath = join(dir, "hypothesis_outcomes.db");

  writeFileSync(
    jsonlPath,
    [
      outcome("1111", "2026-06-01", "1d"),
      outcome("1111", "2026-06-01", "1w"),
      outcome("1111", "2026-06-01", "1m"),
    ].map(row => JSON.stringify(row)).join("\n") + "\n",
    "utf-8"
  );

  const clean = buildOutcomeIntegrityReport({ generatedAt: "2026-06-08", jsonlPath, dbPath });
  assert.equal(clean.status, "ok");
  assert.equal(clean.jsonl.duplicateGroups.length, 0, "horizon が違う outcome は重複ではない");

  writeFileSync(
    jsonlPath,
    [
      outcome("1111", "2026-06-01", "1d"),
      outcome("1111", "2026-06-01", "1d"),
      outcome("1111", "2026-06-01", "1w"),
    ].map(row => JSON.stringify(row)).join("\n") + "\n",
    "utf-8"
  );

  const duplicate = buildOutcomeIntegrityReport({ generatedAt: "2026-06-08", jsonlPath, dbPath });
  assert.equal(duplicate.status, "duplicate_found");
  assert.equal(duplicate.jsonl.duplicateGroups.length, 1);
  assert.equal(duplicate.jsonl.duplicateGroups[0].key, "1111:2026-06-01:1d");
  assert.equal(duplicate.jsonl.duplicateGroups[0].count, 2);

  writeFileSync(
    jsonlPath,
    [
      JSON.stringify(outcome("2222", "2026-06-01", "1d")),
      "{ broken json",
      JSON.stringify(outcome("2222", "2026-06-01", "1w")),
    ].join("\n") + "\n",
    "utf-8"
  );

  const parseError = buildOutcomeIntegrityReport({ generatedAt: "2026-06-08", jsonlPath, dbPath });
  assert.equal(parseError.status, "parse_error");
  assert.equal(parseError.jsonl.totalRows, 2, "壊れていない行は読み続ける");
  assert.equal(parseError.jsonl.parseErrors.length, 1);
  assert.equal(parseError.jsonl.parseErrors[0].lineNumber, 2);
  assert(parseError.jsonl.parseErrors[0].preview.includes("broken json"));
} finally {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

console.log("hypothesis-outcome-integrity.test.ts passed");
