import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "../src/read-only-jsonl.js";

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

console.log("read-only JSONL file boundary: non-regular inputs fail closed without crashing");
