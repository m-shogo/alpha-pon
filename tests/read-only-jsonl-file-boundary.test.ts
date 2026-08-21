import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const directoryPath = join(dir, "directory.jsonl");
mkdirSync(directoryPath);
const directory = readJsonlWithErrors(directoryPath);
assert.deepEqual(directory.rows, []);
assert.equal(directory.parseErrors.length, 1);
assert.equal(directory.parseErrors[0]?.message, "non_regular_file");

const regular = readJsonlWithErrors<{ id: string }>(target);
assert.deepEqual(regular.rows, [{ id: "real" }]);
assert.deepEqual(regular.parseErrors, []);

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

console.log("read-only JSONL file boundary: non-regular and malformed semantic rows fail closed without crashing");
