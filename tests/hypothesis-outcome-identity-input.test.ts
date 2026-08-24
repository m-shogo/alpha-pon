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
].join("\n"), "fixture/outcomes.jsonl");

assert.deepEqual(jsonl.rows.map(row => row.code), ["8136"], "non-canonical code・不存在日・未来detectedAt・未知result・矛盾するhypothesis codeをOutcome履歴provenanceへ通さない");
assert.match(jsonl.warnings[0], /6 malformed JSONL row\(s\).*line\(s\) 2, 3, 4, 5, 6, 7/);

const sqlite = parseHypothesisOutcomeSqlitePayloads([
  JSON.stringify(valid),
  JSON.stringify({ ...valid, code: "8136 " }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: "0000-01-01" } }),
  JSON.stringify({ ...valid, code: "7974", result: "bogus" }),
  JSON.stringify({ ...valid, hypothesis: { detectedAt: todayJst(), code: "7974" } }),
], "fixture/outcomes.db");

assert.deepEqual(sqlite.rows.map(row => row.code), ["8136"], "SQLite payloadでもcanonical Outcome identity/date/result/hypothesis codeだけを保持する");
assert.match(sqlite.warnings[0], /4 malformed record\(s\).*record\(s\) 2, 3, 4, 5/);

console.log("hypothesis-outcome-identity-input: canonical code, detectedAt, result, action label, and nested hypothesis identity fail closed OK");
