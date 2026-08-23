import assert from "node:assert/strict";
import { linkSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
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

const arrayHardLink = join(dir, "array-hard-link.json");
const objectHardLink = join(dir, "object-hard-link.json");
const objectArrayHardLink = join(dir, "object-array-hard-link.json");
linkSync(arrayTarget, arrayHardLink);
linkSync(objectTarget, objectHardLink);
linkSync(objectArrayTarget, objectArrayHardLink);

assert.deepEqual(readReadOnlyJsonArrayFile(arrayHardLink), {
  rows: [],
  missing: false,
  parseError: true,
  invalidRoot: false,
});
assert.deepEqual(readReadOnlyJsonObjectFile(objectHardLink), {
  object: null,
  missing: false,
  parseError: true,
  invalidRoot: false,
});
assert.deepEqual(readReadOnlyJsonObjectArrayFile(objectArrayHardLink, "rows"), {
  object: null,
  rows: [],
  missing: false,
  parseError: true,
  invalidRoot: false,
  invalidField: false,
  invalidRows: 0,
});

const standaloneArray = join(dir, "standalone-array.json");
const standaloneObject = join(dir, "standalone-object.json");
const standaloneObjectArray = join(dir, "standalone-object-array.json");
writeFileSync(standaloneArray, JSON.stringify([{ id: "real" }]));
writeFileSync(standaloneObject, JSON.stringify({ id: "real" }));
writeFileSync(standaloneObjectArray, JSON.stringify({ rows: [{ id: "real" }] }));

assert.deepEqual(readReadOnlyJsonArrayFile<{ id: string }>(standaloneArray).rows, [{ id: "real" }]);
assert.equal(readReadOnlyJsonObjectFile<{ id: string }>(standaloneObject).object?.id, "real");
assert.deepEqual(readReadOnlyJsonObjectArrayFile<{ id: string }>(standaloneObjectArray, "rows").rows, [{ id: "real" }]);

console.log("read-only JSON file boundary: linked evidence rejected, standalone regular files preserved");