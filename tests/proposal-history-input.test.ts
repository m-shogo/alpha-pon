import assert from "node:assert/strict";
import { normalizeProposalHistoryInput, normalizeProposalHistoryRecord } from "../src/proposal-history-input.js";

const valid = normalizeProposalHistoryInput([
  { priority: "S", title: "一次情報の確認", reason: "根拠", action: "確認する" },
  { priority: "Hold", title: "保留" },
]);
assert.equal(valid.invalidRowCount, 0);
assert.deepEqual(valid.proposals, [
  { priority: "S", title: "一次情報の確認", reason: "根拠", action: "確認する" },
  { priority: "Hold", title: "保留" },
]);

const mixed = normalizeProposalHistoryInput([
  { priority: "A", title: "正常" },
  null,
  {},
  { priority: "urgent", title: "未知priority" },
  { priority: "B", title: "" },
  { priority: "B", title: " padded" },
  { priority: "B", title: "正常2", reason: 123 },
]);
assert.equal(mixed.invalidRowCount, 6);
assert.deepEqual(mixed.proposals, [{ priority: "A", title: "正常" }]);

assert.deepEqual(
  normalizeProposalHistoryInput({ priority: "S", title: "arrayではない" }),
  { proposals: [], invalidRowCount: 1 },
);

assert.deepEqual(
  normalizeProposalHistoryRecord({ date: "2026-08-20", priority: "S", title: "正常" }, "2026-08-21"),
  { date: "2026-08-20", priority: "S", title: "正常", reason: "", action: "" },
  "valid historical rows remain usable",
);
for (const invalidRecord of [
  { date: "2026-08-22", priority: "S", title: "未来" },
  { date: "2026-02-31", priority: "S", title: "不存在日" },
  { date: "0000-01-01", priority: "S", title: "year zero" },
  { date: "2026-08-20", priority: "urgent", title: "未知priority" },
  { date: "2026-08-20", priority: "A", title: " padded" },
]) {
  assert.equal(
    normalizeProposalHistoryRecord(invalidRecord, "2026-08-21"),
    null,
    "future/malformed persisted proposal history must fail closed",
  );
}

console.log("proposal history input: malformed rows and persisted PIT violations are isolated");
