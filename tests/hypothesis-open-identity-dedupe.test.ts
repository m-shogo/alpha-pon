import assert from "node:assert/strict";
import { parseExistingStockCandidateHypothesesJsonl } from "../src/stock-candidate-hypothesis-input.js";

const base = {
  schemaVersion: 1,
  code: "8136",
  name: "サンリオ",
  detectedAt: "2026-08-17",
  reviewDueAt: "2026-09-16",
  reason: "synthetic regression fixture",
  expectedTimeframe: "1m",
  expectedDirection: "unknown",
  confidence: 0.5,
  invalidationSignals: [],
  evidenceNeeded: [],
  relatedWorldEventIds: [],
  relatedDisclosureIds: [],
  status: "open",
  label: "監視候補",
};

const parsed = parseExistingStockCandidateHypothesesJsonl(
  [
    JSON.stringify(base),
    JSON.stringify({ ...base, name: "duplicate payload", confidence: 0.7 }),
    JSON.stringify({ ...base, code: "7974", name: "任天堂" }),
    JSON.stringify({ ...base, status: "closed", name: "closed historical row" }),
  ].join("\n"),
  "fixture/hypothesis_predictions.jsonl",
);

assert.deepEqual(
  parsed.rows.map(row => `${row.code}:${row.status}:${row.name}`),
  ["8136:open:サンリオ", "7974:open:任天堂", "8136:closed:closed historical row"],
  "同一code+detectedAtのopen identityは最初のcanonical rowだけをreview/generator入力へ残し、closed履歴は保持する",
);
assert.equal(parsed.warnings.length, 1, "duplicate open identityをsilent dropしない");
assert.match(parsed.warnings[0], /ignored 1 duplicate open identity row\(s\).*line\(s\) 2/);
assert.ok(!parsed.warnings[0].includes("duplicate payload"), "duplicate warningへraw row内容を露出しない");

console.log("hypothesis-open-identity-dedupe: duplicate open review identity fails closed OK");
