import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSanrioConfiguredAdvisoryIntegrity } from "../src/research/edinet-sanrio-configured-advisory-integrity.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-configured-advisory-hardlink-"));
const root = join(base, "data", "edinet");
const outside = join(base, "outside-comparison.json");
const linked = join(root, "comparison.json");

try {
  mkdirSync(root, { recursive: true });
  writeFileSync(outside, "{}\n", "utf-8");
  linkSync(outside, linked);
  const before = readFileSync(outside, "utf-8");

  const result = {
    schemaVersion: 1,
    root,
    stage: "parity_complete_foundation_gate_pending",
    nextCommand: null,
    requiresHumanAction: false,
    missingInputs: [],
    selectedFiles: { configuredComparison: "comparison.json" },
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
    /configuredComparison must be a standalone regular non-symlink file/,
  );
  assert.equal(readFileSync(outside, "utf-8"), before, "external hard-link target must remain unchanged");
  console.log("edinet-sanrio-real-pilot-configured-advisory-hardlink: hard links are rejected OK");
} finally {
  rmSync(base, { recursive: true, force: true });
}
