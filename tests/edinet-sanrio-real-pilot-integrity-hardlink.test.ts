import "./edinet-sanrio-real-pilot-integrity-symlink.test.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

const base = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-integrity-hardlink-"));
const root = join(base, "data", "edinet");
mkdirSync(root, { recursive: true });

const inspectionBase = {
  schemaVersion: 1,
  source: "edinet",
  reviewStatus: "pending_human_review",
  sourceFidelityReportHash: H,
  candidates: [],
  appendAuthorized: false,
};
const inspection = { ...inspectionBase, reportHash: digest(inspectionBase) };
const external = join(base, "external-inspection.json");
writeFileSync(external, `${JSON.stringify(inspection)}\n`, "utf-8");
const before = readFileSync(external, "utf-8");
const inspectionName = "revision-unmatched-anchor-inspection-v1.fixture.json";
linkSync(external, join(root, inspectionName));

const result: SanrioRealPilotPreflightResult = {
  schemaVersion: 1,
  root,
  stage: "parity_complete_foundation_gate_pending",
  nextCommand: null,
  requiresHumanAction: false,
  missingInputs: [],
  selectedFiles: { inspection: inspectionName },
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
  /inspection must be a standalone regular non-symlink file/,
  "hard-linked selected artifacts must fail closed before integrity parsing",
);
assert.equal(readFileSync(external, "utf-8"), before, "external hard-link target must remain untouched");

console.log("edinet-sanrio-real-pilot-integrity-hardlink.test.ts passed");
