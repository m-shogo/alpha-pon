import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const reportPath = "reports/idiosyncratic_shock_threshold_review_queue_latest.json";

execFileSync(
  process.execPath,
  ["--import", "tsx/esm", "src/idiosyncratic-shock-threshold-review-queue.ts"],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  },
);

type QueueSource = {
  origin: "case" | "eligibility_sidecar";
  publishedAt?: string;
};

type QueueRow = {
  id: string;
  score: number;
  checkpoint: string;
  priority: "P0" | "P1" | "P2";
  productionStatus: "confirmed_pass" | "confirmed_block" | "unknown";
  calibrationStatus: "confirmed_pass" | "confirmed_block" | "unknown";
  calibrationBlockers: string[];
  calibrationMissingEvidence: string[];
  explicitCalibration: string | null;
  nextActions: string[];
  sources: QueueSource[];
  [key: string]: unknown;
};

type QueuePayload = {
  scoreRange: string;
  total: number;
  calibrationPass: number;
  calibrationBlock: number;
  calibrationUnknown: number;
  p0Unknown: number;
  rows: QueueRow[];
};

const payload = JSON.parse(readFileSync(reportPath, "utf-8")) as QueuePayload;

assert.equal(payload.scoreRange, "8-11");
assert.equal(payload.total, payload.rows.length);
assert.equal(
  payload.calibrationPass + payload.calibrationBlock + payload.calibrationUnknown,
  payload.total,
  "PASS/BLOCK/UNKNOWN must partition the queue exactly",
);
assert.equal(
  payload.p0Unknown,
  payload.rows.filter(row => row.priority === "P0" && row.calibrationStatus === "unknown").length,
);
assert(payload.rows.length > 0, "threshold review queue must contain researched or pending controls");

const priorityRank = { P0: 0, P1: 1, P2: 2 } as const;
for (let index = 0; index < payload.rows.length; index += 1) {
  const row = payload.rows[index];
  assert(row.score >= 8 && row.score <= 11, `${row.id}: queue must contain only score 8-11 cases`);
  assert.notEqual(
    row.productionStatus,
    "confirmed_pass",
    `${row.id}: below-threshold research must never become a production PASS`,
  );

  if (index > 0) {
    const previous = payload.rows[index - 1];
    assert(
      priorityRank[previous.priority] <= priorityRank[row.priority],
      `${row.id}: queue priority ordering must remain P0 -> P1 -> P2`,
    );
  }

  if (row.calibrationStatus === "confirmed_pass") {
    assert.equal(row.explicitCalibration, "confirmed_pass", `${row.id}: shadow PASS must be explicit`);
    assert.deepEqual(row.calibrationBlockers, [], `${row.id}: shadow PASS cannot retain hard blockers`);
    assert.deepEqual(row.calibrationMissingEvidence, [], `${row.id}: shadow PASS cannot retain missing evidence`);
  }

  if (row.calibrationStatus === "unknown") {
    assert(row.nextActions.length > 0, `${row.id}: UNKNOWN must remain actionable`);
  }

  for (const source of row.sources) {
    if (source.origin !== "eligibility_sidecar") continue;
    assert(source.publishedAt, `${row.id}: sidecar evidence requires publishedAt`);
    assert(
      source.publishedAt <= row.checkpoint,
      `${row.id}: future sidecar evidence must not enter the threshold review queue`,
    );
  }

  for (const forbiddenKey of [
    "return1m",
    "return3m",
    "return1y",
    "signalReturn1m",
    "signalReturn3m",
    "signalReturn1y",
    "benchmarkRelative3m",
    "outcome",
  ]) {
    assert(!(forbiddenKey in row), `${row.id}: pre-outcome review queue leaked ${forbiddenKey}`);
  }
}

console.log(
  `idiosyncratic-shock threshold review queue tests: ${payload.total} rows, pass/block/unknown=${payload.calibrationPass}/${payload.calibrationBlock}/${payload.calibrationUnknown}`,
);
