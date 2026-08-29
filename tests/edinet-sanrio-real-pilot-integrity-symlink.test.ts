import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSanrioRealPilotPreflightIntegrity } from "../src/research/edinet-sanrio-real-pilot-integrity.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

type JsonObject = Record<string, unknown>;
const H = "a".repeat(64);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-integrity-symlink-"));
const root = join(base, "data", "edinet");
const outside = join(base, "outside");
mkdirSync(root, { recursive: true });
mkdirSync(outside, { recursive: true });

const inspectionBase = {
  schemaVersion: 1,
  source: "edinet",
  reviewStatus: "pending_human_review",
  sourceFidelityReportHash: H,
  candidates: [],
  appendAuthorized: false,
};
const inspection = {
  ...inspectionBase,
  reportHash: digest(inspectionBase),
};
const inspectionName = "revision-unmatched-anchor-inspection-v1.fixture.json";
writeFileSync(join(outside, inspectionName), `${JSON.stringify(inspection)}\n`, "utf-8");
symlinkSync(outside, join(root, "escaped"), "dir");

const result: SanrioRealPilotPreflightResult = {
  schemaVersion: 1,
  root,
  stage: "parity_complete_foundation_gate_pending",
  nextCommand: null,
  requiresHumanAction: false,
  missingInputs: [],
  selectedFiles: {
    inspection: `escaped/${inspectionName}`,
  },
  warnings: [],
  safety: {
    rawContentPrinted: false,
    automaticReplacementAuthorized: false,
    foundationAppendAuthorized: false,
    automaticTradingAuthorized: false,
  },
};

assert.throws(
  () => assertSanrioRealPilotPreflightIntegrity(result, root),
  /escaped EDINET root through symlink ancestry/,
);

console.log("edinet-sanrio-real-pilot-integrity-symlink: ancestor symlink escape is rejected OK");
