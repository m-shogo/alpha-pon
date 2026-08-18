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
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("periodic-review-score-input tests passed");
