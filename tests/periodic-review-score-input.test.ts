import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPeriodicScoreLogs, parsePeriodicScoreLog } from "../src/periodic-review-score-input.js";

const valid = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
  },
]));
assert.ok(valid);
assert.equal(valid.entries.length, 1);
assert.deepEqual(valid.invalidRows, []);

const mixed = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    warnings: ["ok"],
  },
  {
    code: "4661",
    name: "broken",
    score: 40,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    warnings: {},
  },
]));
assert.ok(mixed);
assert.equal(mixed.entries.length, 1, "正常rowは壊れrowの周囲でも保持する");
assert.deepEqual(mixed.invalidRows, [2], "壊れrowはsilent dropせず行番号を保持する");

const unknownAlertLevel = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "later",
    createdAt: "2026-08-18",
  },
]));
assert.ok(unknownAlertLevel);
assert.equal(unknownAlertLevel.entries.length, 0, "producer契約外alertLevelを週次/月次集計へ混入させない");
assert.deepEqual(unknownAlertLevel.invalidRows, [1]);

const unknownExpertVerdict = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    expertReview: { finalVerdict: "block ", consensusScore: 0.2 },
  },
]));
assert.ok(unknownExpertVerdict);
assert.equal(unknownExpertVerdict.entries.length, 0, "producer契約外expert verdictでblock集計をすり抜けさせない");
assert.deepEqual(unknownExpertVerdict.invalidRows, [1]);

const unknownRiskDecision = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    riskReview: { decision: "reject ", blockers: ["insufficient evidence"] },
  },
]));
assert.ok(unknownRiskDecision);
assert.equal(unknownRiskDecision.entries.length, 0, "producer契約外risk decisionを週次/月次evidenceへ混入させない");
assert.deepEqual(unknownRiskDecision.invalidRows, [1]);

const paddedCode = parsePeriodicScoreLog(JSON.stringify([
  {
    code: " 8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
  },
]));
assert.ok(paddedCode);
assert.equal(paddedCode.entries.length, 0, "前後空白付きcodeを別identityとして採用しない");
assert.deepEqual(paddedCode.invalidRows, [1]);

const malformedBucketIdentities = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "padded tag",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    tags: [" entertainment "],
  },
  {
    code: "4661",
    name: "empty rule",
    score: 50,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    rules: [""],
  },
]));
assert.ok(malformedBucketIdentities);
assert.equal(malformedBucketIdentities.entries.length, 0, "padded/empty tag・rule identityで週次/月次bucketを分裂させない");
assert.deepEqual(malformedBucketIdentities.invalidRows, [1, 2]);

const malformedReviewEvidence = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "padded warning",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    warnings: [" data gap "],
  },
  {
    code: "4661",
    name: "empty negative reason",
    score: 50,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    negativeReasons: [""],
  },
  {
    code: "7974",
    name: "padded blocker",
    score: 45,
    alertLevel: "daily",
    createdAt: "2026-08-18",
    riskReview: { decision: "watch", blockers: [" liquidity "] },
  },
]));
assert.ok(malformedReviewEvidence);
assert.equal(malformedReviewEvidence.entries.length, 0, "blank/padded warning・negative reason・blockerを別Evidence bucketとして採用しない");
assert.deepEqual(malformedReviewEvidence.invalidRows, [1, 2, 3]);

const duplicateCodes = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "first",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
  },
  {
    code: "8136",
    name: "second",
    score: 70,
    alertLevel: "urgent",
    createdAt: "2026-08-18",
  },
  {
    code: "4661",
    name: "unique",
    score: 50,
    alertLevel: "daily",
    createdAt: "2026-08-18",
  },
]));
assert.ok(duplicateCodes);
assert.deepEqual(duplicateCodes.entries.map(entry => entry.code), ["4661"], "重複identityは入力順で正本化せず全参加rowを隔離する");
assert.deepEqual(duplicateCodes.invalidRows, [1, 2]);

const impossibleCreatedAt = parsePeriodicScoreLog(JSON.stringify([
  {
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-02-31",
  },
]));
assert.ok(impossibleCreatedAt);
assert.equal(impossibleCreatedAt.entries.length, 0, "不存在createdAtをperiodic evidenceへ採用しない");
assert.deepEqual(impossibleCreatedAt.invalidRows, [1]);

assert.equal(parsePeriodicScoreLog("{broken"), null);
assert.equal(parsePeriodicScoreLog(JSON.stringify({ code: "8136" })), null);
assert.equal(parsePeriodicScoreLog("null"), null);

const dir = mkdtempSync(join(tmpdir(), "periodic-score-input-"));
try {
  const row = JSON.stringify([{
    code: "8136",
    name: "sample",
    score: 60,
    alertLevel: "daily",
    createdAt: "2026-08-18",
  }]);
  writeFileSync(join(dir, "scores_2026-08-18.json"), row);
  writeFileSync(join(dir, "scores_2026-08-20.json"), row);
  writeFileSync(join(dir, "scores_2026-02-31.json"), row);
  writeFileSync(join(dir, "scores_2026-08-19.json"), row);

  const loaded = loadPeriodicScoreLogs(dir, "2026-08-19");
  assert.equal(loaded.entries.length, 1, "current/past snapshotでrow.createdAtがsnapshot dateと一致するevidenceだけ採用する");
  assert.deepEqual(
    loaded.invalidFiles.sort(),
    ["scores_2026-02-31.json", "scores_2026-08-20.json"],
    "不存在日とfuture snapshotをPIT evidenceから隔離する",
  );
  assert.ok(
    loaded.invalidRows.includes("scores_2026-08-19.json#row-1"),
    "snapshot dateとrow.createdAtが一致しないrowはprovenance不整合として隔離する",
  );

  for (const invalidAsOf of ["not-a-date", "2026-02-31", "0000-01-01"] as const) {
    const invalidCutoff = loadPeriodicScoreLogs(dir, invalidAsOf);
    assert.deepEqual(invalidCutoff.entries, [], "不正asOfでfuture periodic evidenceをfail-openさせない");
    assert.deepEqual(
      invalidCutoff.invalidFiles,
      [
        "scores_2026-02-31.json",
        "scores_2026-08-18.json",
        "scores_2026-08-19.json",
        "scores_2026-08-20.json",
      ],
      "不正asOfではcandidate snapshot全体をinvalidとして監査可能にする",
    );
    assert.deepEqual(invalidCutoff.invalidRows, []);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("periodic-review-score-input tests passed");
