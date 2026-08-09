import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "src/research/cli/report-foundation-pilot-structural-status.ts",
  "utf-8",
);

const parserImport = 'import { parseExplicitIso8601Instant } from "../iso-instant.js";';
const strictParse = "parseExplicitIso8601Instant(value, `--${name}`);";
const observationCall = "observation: buildObservation(target),";

assert.ok(source.includes(parserImport), "CLI must import the canonical explicit-instant parser");
assert.ok(source.includes(strictParse), "timestampArg must validate with the canonical explicit-instant parser");
assert.equal(
  source.includes("Number.isFinite(Date.parse(value))"),
  false,
  "CLI timestampArg must not fall back to runtime-dependent Date.parse acceptance",
);
assert.ok(
  source.indexOf(strictParse) < source.indexOf(observationCall),
  "information cutoff must be strictly validated before any Foundation repository observation is built",
);

console.log("foundation-pilot-structural-status-cli-preflight: cutoff validates before repository reads OK");
