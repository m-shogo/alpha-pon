import assert from "node:assert/strict";
import { normalizeProposalHistoryInput } from "../src/proposal-history-input.js";

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

console.log("proposal history input: malformed rows are isolated");
