import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAnalogyPredictionsForReview } from "../src/analogy-review-input.js";

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
    `${JSON.stringify(valid)}\n{broken-json\n`,
    "utf-8",
  );

  const result = loadAnalogyPredictionsForReview(dir);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.eventId, valid.eventId);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0] ?? "", /parse_error 1/);
  assert.match(result.warnings[0] ?? "", /lines 2/);
  assert.doesNotMatch(result.warnings[0] ?? "", /broken-json/);

  console.log("analogy-review-input.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
