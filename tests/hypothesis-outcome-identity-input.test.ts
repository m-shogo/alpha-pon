import assert from "node:assert/strict";
import { addDaysJst, todayJst } from "../src/date.js";
import { parseHypothesisOutcomesJsonl, parseHypothesisOutcomeSqlitePayloads } from "../src/hypothesis-outcome-input.js";

const valid = {
  code: "8136",
  hypothesis: { detectedAt: todayJst() },
  reviewHorizon: "1m",
  actionLabel: "log",
};

const jsonl = parseHypothesisOutcomesJsonl([
  JSON.stringify(valid),
  JSON.stringify({ ...valid, code: " 8136 " }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: "2026-02-31" } }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: addDaysJst(todayJst(), 1) } }),
  JSON.stringify({ ...valid, code: "7974", result: "bogus" }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: todayJst(), code: "7974" } }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: todayJst(), code: " 8136 " } }),
  JSON.stringify({ ...valid, maxDrawdownPct: "-12.5" }),
  JSON.stringify({ ...valid, maxDrawdownPct: { pct: -12.5 } }),
  JSON.stringify({ ...valid, maxDrawdownPct: 4.2 }),
].join("\n"), "fixture/outcomes.jsonl");

assert.deepEqual(jsonl.rows.map(row => row.code), ["8136"], "non-canonical code・不存在日・未来detectedAt・未知result・矛盾するhypothesis code・non-numeric/positive maxDrawdownPctをOutcome履歴provenanceへ通さない");
assert.equal(jsonl.rows[0]?.result, "unknown", "legacy partial Outcomeのresult欠落はreview対象から消えないようcanonical unknownへ正規化する");
assert.match(jsonl.warnings[0], /9 malformed JSONL row\(s\).*line\(s\) 2, 3, 4, 5, 6, 7, 8, 9, 10/);

const sqlite = parseHypothesisOutcomeSqlitePayloads([
  JSON.stringify(valid),
  JSON.stringify({ ...valid, code: "8136 " }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: "0000-01-01" } }),
  JSON.stringify({ ...valid, code: "7974", result: "bogus" }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: todayJst(), code: "7974" } }),
  JSON.stringify({ ...valid, maxDrawdownPct: "-8.0" }),
  JSON.stringify({ ...valid, maxDrawdownPct: 0.01 }),
], "fixture/outcomes.db");

assert.deepEqual(sqlite.rows.map(row => row.code), ["8136"], "SQLite payloadでもcanonical Outcome identity/date/result/hypothesis code/maxDrawdownPctだけを保持する");
assert.equal(sqlite.rows[0]?.result, "unknown", "SQLite legacy partial Outcomeでもresult欠落をcanonical unknownへ正規化する");
assert.match(sqlite.warnings[0], /6 malformed record\(s\).*record\(s\) 2, 3, 4, 5, 6, 7/);

console.log("hypothesis-outcome-identity-input: canonical code, detectedAt, result, action label, nested hypothesis identity, and max drawdown fail closed OK");
