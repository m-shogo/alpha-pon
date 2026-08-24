import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAnalogyReviewMaxPerRun, parseAnalogyReviewOffset } from "../src/analogy-review-config.js";
import { loadAnalogyOutcomesForReview, loadAnalogyPredictionsForReview } from "../src/analogy-review-input.js";

assert.equal(parseAnalogyReviewMaxPerRun(undefined), 12, "未指定は既定12件");
assert.equal(parseAnalogyReviewMaxPerRun("12"), 12, "正の整数を保持する");
assert.equal(parseAnalogyReviewMaxPerRun("120"), 120, "上限120件を許可する");
assert.equal(parseAnalogyReviewMaxPerRun("121"), 120, "上限超過は120件へ丸める");
assert.equal(parseAnalogyReviewMaxPerRun("0"), 12, "0は既定値へfail-closedする");
assert.equal(parseAnalogyReviewMaxPerRun("-1"), 12, "負数は既定値へfail-closedする");
assert.equal(parseAnalogyReviewMaxPerRun("abc"), 12, "非numeric値は既定値へfail-closedする");
assert.equal(parseAnalogyReviewMaxPerRun("1.5"), 12, "小数は既定値へfail-closedする");
assert.equal(parseAnalogyReviewMaxPerRun("12reviews"), 12, "部分parse可能な文字列をrejectする");
assert.equal(parseAnalogyReviewOffset("0"), 0, "offset 0を許可する");
assert.equal(parseAnalogyReviewOffset("12"), 12, "正のoffsetを保持する");
assert.equal(parseAnalogyReviewOffset("abc"), 0, "非numeric offsetは0へfail-closedする");
assert.equal(parseAnalogyReviewOffset("-1"), 0, "負数offsetは0へfail-closedする");
assert.equal(parseAnalogyReviewOffset("1.5"), 0, "小数offsetは0へfail-closedする");
assert.equal(parseAnalogyReviewOffset("12reviews"), 0, "部分parse可能なoffsetをrejectする");

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
  const impossibleCreatedAt = { ...valid, createdAt: "2026-02-31" };
  const impossibleReviewDueAt = { ...valid, reviewDueAt: "2026-02-31" };
  const mismatchedReviewDueAt = { ...valid, reviewDueAt: "2026-08-03" };
  const paddedEventId = { ...valid, eventId: ` ${valid.eventId} ` };
  const paddedCandidateCode = { ...valid, candidateCode: ` ${valid.candidateCode} ` };

  writeFileSync(
    join(dir, "2026-08-01.jsonl"),
    [valid, {}, impossibleCreatedAt, impossibleReviewDueAt, mismatchedReviewDueAt, paddedEventId, paddedCandidateCode]
      .map(row => JSON.stringify(row))
      .join("\n") + "\n{broken-json\n",
    "utf-8",
  );

  const result = loadAnalogyPredictionsForReview(dir);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.eventId, valid.eventId);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 8/);
  assert.doesNotMatch(result.warnings[0] ?? "", /broken-json/);
  assert.match(result.warnings[1] ?? "", /invalid_shape 6/);

  const outcomePath = join(dir, "outcomes.jsonl");
  const validOutcome = {
    schemaVersion: 1,
    createdAt: "2026-08-01",
    evaluatedAt: "2026-08-02",
    eventId: valid.eventId,
    timeframe: "1d",
    candidateCode: valid.candidateCode,
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
  const duplicateOutcome = { ...validOutcome, actualOutcome: "duplicate identity" };
  const uniqueOutcome = {
    ...validOutcome,
    eventId: "2026-08-01_8136_lesson-2_1d",
    lessonId: "lesson-2",
    lessonTitle: "Unique lesson",
  };
  const unsafeSuppressor = {
    eventId: valid.eventId,
    timeframe: "1d",
    quality: "useful",
  };
  const impossibleDate = { ...validOutcome, evaluatedAt: "2026-02-31" };
  const reversedChronology = { ...validOutcome, createdAt: "2026-08-03", evaluatedAt: "2026-08-02" };
  const futureOutcome = { ...validOutcome, evaluatedAt: "2026-08-19" };
  const malformedNumericOutcome = { ...validOutcome, returnPct: "10" };
  const paddedOutcomeEventId = { ...validOutcome, eventId: ` ${valid.eventId} ` };
  const paddedOutcomeCandidateCode = { ...validOutcome, candidateCode: ` ${valid.candidateCode} ` };
  writeFileSync(
    outcomePath,
    [validOutcome, duplicateOutcome, uniqueOutcome, unsafeSuppressor, impossibleDate, reversedChronology, futureOutcome, malformedNumericOutcome, paddedOutcomeEventId, paddedOutcomeCandidateCode]
      .map(row => JSON.stringify(row))
      .join("\n") + "\n{broken-outcome\n",
    "utf-8",
  );

  const outcomeResult = loadAnalogyOutcomesForReview(outcomePath, "2026-08-18");
  assert.equal(outcomeResult.rows.length, 2, "重複Outcome identityはfirst canonical rowだけ保持して二重計上しない");
  assert.deepEqual(
    outcomeResult.rows.map(row => row.eventId),
    [validOutcome.eventId, uniqueOutcome.eventId],
    "最初のcanonical Outcomeとunrelated unique Outcomeを保持する",
  );
  assert.equal(outcomeResult.warnings.length, 3);
  assert.match(outcomeResult.warnings[0] ?? "", /parse_error 1/);
  assert.match(outcomeResult.warnings[0] ?? "", /lines 11/);
  assert.doesNotMatch(outcomeResult.warnings[0] ?? "", /broken-outcome/);
  assert.match(outcomeResult.warnings[1] ?? "", /invalid_shape 7/);
  assert.match(outcomeResult.warnings[2] ?? "", /duplicate_identity 1/);
  assert.throws(() => loadAnalogyOutcomesForReview(outcomePath, "2026-02-31"), /real YYYY-MM-DD/);

  console.log("analogy-review-input.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
