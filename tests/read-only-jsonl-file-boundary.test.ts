import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNotificationFeedbackInput } from "../src/notification-feedback-input.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "../src/read-only-jsonl.js";
import { readNonMoveHistoryJsonl } from "../src/stale-hypothesis-input.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-read-only-jsonl-"));
const target = join(dir, "target.jsonl");
writeFileSync(target, `${JSON.stringify({ id: "real" })}\n`);

const link = join(dir, "link.jsonl");
symlinkSync(target, link);
const linked = readJsonlWithErrors<{ id: string }>(link);
assert.deepEqual(linked.rows, []);
assert.equal(linked.parseErrors.length, 1);
assert.equal(linked.parseErrors[0]?.lineNumber, 0);
assert.equal(formatReadOnlyJsonlParseWarning(link, linked.parseErrors), `${link}: read_error 1`);

const hardLink = join(dir, "hard-link.jsonl");
linkSync(target, hardLink);
const hardLinked = readJsonlWithErrors<{ id: string }>(hardLink);
assert.deepEqual(hardLinked.rows, []);
assert.equal(hardLinked.parseErrors.length, 1);
assert.equal(hardLinked.parseErrors[0]?.lineNumber, 0);
assert.equal(hardLinked.parseErrors[0]?.message, "non_regular_file");
assert.equal(formatReadOnlyJsonlParseWarning(hardLink, hardLinked.parseErrors), `${hardLink}: read_error 1`);

const directoryPath = join(dir, "directory.jsonl");
mkdirSync(directoryPath);
const directory = readJsonlWithErrors(directoryPath);
assert.deepEqual(directory.rows, []);
assert.equal(directory.parseErrors.length, 1);
assert.equal(directory.parseErrors[0]?.message, "non_regular_file");

const regular = readJsonlWithErrors<{ id: string }>(target);
assert.deepEqual(regular.rows, []);
assert.equal(regular.parseErrors.length, 1);
assert.equal(regular.parseErrors[0]?.message, "non_regular_file");

const standalone = join(dir, "standalone.jsonl");
writeFileSync(standalone, `${JSON.stringify({ id: "real" })}\n`);
assert.deepEqual(readJsonlWithErrors<{ id: string }>(standalone).rows, [{ id: "real" }]);
assert.deepEqual(readJsonlWithErrors(standalone).parseErrors, []);

const nonMoveHistoryPath = join(dir, "company_non_move_history.jsonl");
writeFileSync(nonMoveHistoryPath, [
  JSON.stringify({ code: "8136", nonMoveReasons: ["valuation"] }),
  "null",
  JSON.stringify(["bad-row"]),
  JSON.stringify({ code: "8136", nonMoveReasons: {} }),
  JSON.stringify({ code: " 8136 ", nonMoveReasons: ["identity"] }),
  JSON.stringify({ code: "6758", nonMoveReasons: ["earnings"] }),
].join("\n"));
const nonMoveHistory = readNonMoveHistoryJsonl(nonMoveHistoryPath);
assert.deepEqual(nonMoveHistory.rows, [
  { code: "8136", nonMoveReasons: ["valuation"] },
  { code: "6758", nonMoveReasons: ["earnings"] },
]);
assert.equal(nonMoveHistory.invalidRowCount, 4);
assert.match(nonMoveHistory.warning ?? "", /invalid_row 4/);

const feedbackPath = join(dir, "notification-feedback.jsonl");
writeFileSync(feedbackPath, [
  JSON.stringify({ date: "2026-08-16", value: "useful", topic: "決算", memo: "役立った", createdAt: "2026-08-16T09:00:00Z" }),
  JSON.stringify({ date: "2999-01-01", value: "useful", topic: "future", memo: "", createdAt: "2999-01-01T00:00:00+09:00" }),
  JSON.stringify({ date: "2026-08-16", value: "noise", topic: "no timezone", memo: "", createdAt: "2026-08-16T09:00:00" }),
].join("\n"));
const feedback = readNotificationFeedbackInput(feedbackPath);
assert.deepEqual(feedback.records.map(row => row.topic), ["決算"]);
assert.match(feedback.warning ?? "", /invalid_rows 2/);

console.log("read-only JSONL file boundary: non-regular, hard-linked, malformed semantic, and future/timezone-invalid rows fail closed without crashing");