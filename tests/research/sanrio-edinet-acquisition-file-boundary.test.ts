import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/run-sanrio-edinet-acquisition.ts", "utf-8");

assert.match(
  source,
  /function localRoot[\s\S]*dataStat\.isSymbolicLink\(\) \|\| !dataStat\.isDirectory\(\)/,
  "data ancestor must reject symlink and non-directory paths before data/edinet is created",
);
assert.match(
  source,
  /function localRoot[\s\S]*stat\.isSymbolicLink\(\) \|\| !stat\.isDirectory\(\)/,
  "data/edinet root must reject symlink and non-directory paths",
);
assert.match(
  source,
  /function resolveInventoryPath[\s\S]*stat\.isSymbolicLink\(\) \|\| !stat\.isFile\(\) \|\| stat\.nlink !== 1/,
  "explicit --inventory path must reject hard-linked files",
);
assert.match(
  source,
  /function latestInventoryPath[\s\S]*stat\.isSymbolicLink\(\) \|\| !stat\.isFile\(\) \|\| stat\.nlink !== 1/,
  "automatic latest-inventory selection must reject hard-linked files",
);

console.log("sanrio-edinet-acquisition-file-boundary.test.ts passed");
