import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertFoundationStructuralStatusGeneratedAtCoversCutoff } from "../src/research/foundation-pilot-structural-status-time.js";

const source = readFileSync(
  "src/research/cli/report-foundation-pilot-structural-status.ts",
  "utf-8",
);
const wrapper = readFileSync(
  "scripts/run-foundation-pilot-structural-status-local.sh",
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
assert.ok(
  wrapper.indexOf("preflight-foundation-pilot-structural-status-time.ts")
    < wrapper.indexOf("report-foundation-pilot-structural-status.ts"),
  "canonical local wrapper must reject future informationCutoff before repository observation/report generation",
);

assert.doesNotThrow(() => assertFoundationStructuralStatusGeneratedAtCoversCutoff(
  "2026-08-15T06:00:00.000000000+09:00",
  "2026-08-14T21:00:00.000000000Z",
));
assert.doesNotThrow(() => assertFoundationStructuralStatusGeneratedAtCoversCutoff(
  "2026-08-15T06:00:00.000000000+09:00",
  "2026-08-15T06:00:00.000000000+09:00",
));
assert.throws(() => assertFoundationStructuralStatusGeneratedAtCoversCutoff(
  "2026-08-15T06:00:00.000000000+09:00",
  "2026-08-15T06:00:00.000000001+09:00",
), /generatedAt must be at or after informationCutoff/);
assert.throws(() => assertFoundationStructuralStatusGeneratedAtCoversCutoff(
  "2026-08-15T06:00:00",
  "2026-08-15T05:59:59+09:00",
), /explicit timezone/);

console.log("foundation-pilot-structural-status-cli-preflight: cutoff validates before repository reads OK");
console.log("foundation-pilot-structural-status-cli-preflight: generatedAt covers cutoff at nanosecond precision OK");
