import assert from "node:assert/strict";
import { linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isCanonicalReadOnlyJsonFile,
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

assert.equal(isCanonicalReadOnlyJsonFile(arrayLink), false);
assert.equal(isCanonicalReadOnlyJsonFile(objectLink), false);
assert.equal(isCanonicalReadOnlyJsonFile(objectArrayLink), false);

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

assert.equal(isCanonicalReadOnlyJsonFile(arrayHardLink), false);
assert.equal(isCanonicalReadOnlyJsonFile(objectHardLink), false);
assert.equal(isCanonicalReadOnlyJsonFile(objectArrayHardLink), false);

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

assert.equal(isCanonicalReadOnlyJsonFile(standaloneArray), true);
assert.equal(isCanonicalReadOnlyJsonFile(standaloneObject), true);
assert.equal(isCanonicalReadOnlyJsonFile(standaloneObjectArray), true);
assert.deepEqual(readReadOnlyJsonArrayFile<{ id: string }>(standaloneArray).rows, [{ id: "real" }]);
assert.equal(readReadOnlyJsonObjectFile<{ id: string }>(standaloneObject).object?.id, "real");
assert.deepEqual(readReadOnlyJsonObjectArrayFile<{ id: string }>(standaloneObjectArray, "rows").rows, [{ id: "real" }]);

const ancestorDir = mkdtempSync(join(process.cwd(), ".alpha-pon-read-only-json-ancestor-"));
try {
  const realDir = join(ancestorDir, "real");
  const linkedDir = join(ancestorDir, "linked");
  mkdirSync(realDir);
  writeFileSync(join(realDir, "evidence.json"), JSON.stringify([{ id: "aliased" }]));
  symlinkSync(realDir, linkedDir, "dir");
  const aliasedPath = join(linkedDir, "evidence.json");

  assert.equal(isCanonicalReadOnlyJsonFile(aliasedPath), false);
  assert.deepEqual(readReadOnlyJsonArrayFile(aliasedPath), {
    rows: [],
    missing: false,
    parseError: true,
    invalidRoot: false,
  });
} finally {
  rmSync(ancestorDir, { recursive: true, force: true });
}

console.log("read-only JSON file boundary: linked evidence rejected, standalone regular files preserved");
