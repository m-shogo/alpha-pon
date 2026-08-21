import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readReadOnlyJsonArrayFile,
  readReadOnlyJsonObjectArrayFile,
  readReadOnlyJsonObjectFile,
} from "../src/read-only-json-file.js";

const dir = mkdtempSync(join(tmpdir(), "alpha-pon-read-only-json-"));
const arrayTarget = join(dir, "array-target.json");
const objectTarget = join(dir, "object-target.json");
const objectArrayTarget = join(dir, "object-array-target.json");
writeFileSync(arrayTarget, JSON.stringify([{ id: "real" }]));
writeFileSync(objectTarget, JSON.stringify({ id: "real" }));
writeFileSync(objectArrayTarget, JSON.stringify({ rows: [{ id: "real" }] }));

const arrayLink = join(dir, "array-link.json");
const objectLink = join(dir, "object-link.json");
const objectArrayLink = join(dir, "object-array-link.json");
symlinkSync(arrayTarget, arrayLink);
symlinkSync(objectTarget, objectLink);
symlinkSync(objectArrayTarget, objectArrayLink);

assert.deepEqual(readReadOnlyJsonArrayFile(arrayLink), {
  rows: [],
  missing: false,
  parseError: true,
  invalidRoot: false,
});

assert.deepEqual(readReadOnlyJsonObjectFile(objectLink), {
  object: null,
  missing: false,
  parseError: true,
  invalidRoot: false,
});

assert.deepEqual(readReadOnlyJsonObjectArrayFile(objectArrayLink, "rows"), {
  object: null,
  rows: [],
  missing: false,
  parseError: true,
  invalidRoot: false,
  invalidField: false,
  invalidRows: 0,
});

assert.deepEqual(readReadOnlyJsonArrayFile<{ id: string }>(arrayTarget).rows, [{ id: "real" }]);
assert.equal(readReadOnlyJsonObjectFile<{ id: string }>(objectTarget).object?.id, "real");
assert.deepEqual(readReadOnlyJsonObjectArrayFile<{ id: string }>(objectArrayTarget, "rows").rows, [{ id: "real" }]);

console.log("read-only JSON file boundary: symlink evidence rejected, regular files preserved");
