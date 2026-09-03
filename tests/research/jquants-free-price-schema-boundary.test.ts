import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../src/research/cli/audit-jquants-free-price-store.ts", import.meta.url),
  "utf-8",
);

assert.match(
  source,
  /isCanonicalReadOnlyJsonFile\(path\)/,
  "J-Quants free price audit must reject linked/non-regular canonical schema inputs",
);
assert.match(
  source,
  /from "\.\.\/\.\.\/read-only-json-file\.js"/,
  "J-Quants free price audit must use the shared canonical read-only JSON boundary",
);

console.log("jquants-free-price-schema-boundary.test.ts passed");
