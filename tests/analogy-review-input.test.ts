import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAnalogyOutcomesForReview, loadAnalogyPredictionsForReview } from "../src/analogy-review-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-analogy-review-"));

try {
  const valid = {
    schemaVersion: 1,
    createdAt: "2026-08-01",
    reviewDueAt: "2026-08-02",
    eventId: "2026-08-01_8136_lesson-1_1d",
    timeframe: "1d",
    candidateCode: "8136",
    candidateName: "Sanrio",
    lessonId: "lesson-1",
    lessonTitle: "Example lesson",
    thesis: "Example thesis",
    expectedDirection: "up",
    confidence: 0.5,
    conditions: [],
    invalidationSignals: [],
    evidenceNeeded: [],
    similarPoints: [],
    differentPoints: [],
    status: "open",
  };

  writeFileSync(
    join(dir, "2026-08-01.jsonl"),
    `${JSON.stringify(valid)}\n{}\n{broken-json\n`,
    "utf-8",
  );

  const result = loadAnalogyPredictionsForReview(dir);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.eventId, valid.eventId);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 3/);
  assert.doesNotMatch(result.warnings[0] ?? "", /broken-json/);
  assert.match(result.warnings[1] ?? "", /invalid_shape 1/);

  const outcomePath = join(dir, "outcomes.jsonl");
  const validOutcome = {
    schemaVersion: 1,
    createdAt: "2026-08-01",
    evaluatedAt: "2026-08-02",
    eventId: valid.eventId,
    timeframe: "1d",
    lessonId: "lesson-1",
    lessonTitle: "Example lesson",
    direction: "same",
    quality: "useful",
    actualOutcome: "matched",
    whatMatched: [],
    whatDiffered: [],
    missedSignals: [],
    improvedRuleIdeas: [],
  };
  const unsafeSuppressor = {
    eventId: valid.eventId,
    timeframe: "1d",
    quality: "useful",
  };
  const impossibleDate = { ...validOutcome, evaluatedAt: "2026-02-31" };
  const reversedChronology = { ...validOutcome, createdAt: "2026-08-03", evaluatedAt: "2026-08-02" };
  const futureOutcome = { ...validOutcome, evaluatedAt: "2026-08-19" };
  writeFileSync(
    outcomePath,
    [validOutcome, unsafeSuppressor, impossibleDate, reversedChronology, futureOutcome]
      .map(row => JSON.stringify(row))
      .join("\n") + "\n{broken-outcome\n",
    "utf-8",
  );

  const outcomeResult = loadAnalogyOutcomesForReview(outcomePath, "2026-08-18");
  assert.equal(outcomeResult.rows.length, 1);
  assert.equal(outcomeResult.rows[0]?.eventId, valid.eventId);
  assert.equal(outcomeResult.warnings.length, 2);
  assert.match(outcomeResult.warnings[0] ?? "", /parse_error 1/);
  assert.match(outcomeResult.warnings[0] ?? "", /lines 6/);
  assert.doesNotMatch(outcomeResult.warnings[0] ?? "", /broken-outcome/);
  assert.match(outcomeResult.warnings[1] ?? "", /invalid_shape 4/);
  assert.throws(() => loadAnalogyOutcomesForReview(outcomePath, "2026-02-31"), /real YYYY-MM-DD/);

  console.log("analogy-review-input.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
