import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSanrioConfiguredAdvisoryIntegrity } from "../src/research/edinet-sanrio-configured-advisory-integrity.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-configured-advisory-symlink-"));
const root = join(base, "data", "edinet");
const outside = join(base, "outside");
mkdirSync(root, { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(join(outside, "comparison.json"), "{}\n", "utf-8");
symlinkSync(outside, join(root, "escaped"), "dir");

const result = {
  schemaVersion: 1,
  root,
  stage: "parity_complete_foundation_gate_pending",
  nextCommand: null,
  requiresHumanAction: false,
  missingInputs: [],
  selectedFiles: { configuredComparison: "escaped/comparison.json" },
  warnings: [],
  safety: {
    rawContentPrinted: false,
    automaticReplacementAuthorized: false,
    foundationAppendAuthorized: false,
    automaticTradingAuthorized: false,
  },
} as SanrioRealPilotPreflightResult;

assert.throws(
  () => assertSanrioConfiguredAdvisoryIntegrity(result, root),
  /configuredComparison escaped EDINET root through symlink ancestry/,
);

console.log("edinet-sanrio-real-pilot-configured-advisory-symlink: ancestor symlink escape is rejected OK");
