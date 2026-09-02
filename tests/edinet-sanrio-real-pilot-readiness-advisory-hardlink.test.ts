import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSanrioInventoryCompatibilityAdvisory } from "../src/research/edinet-sanrio-real-pilot-readiness-advisory.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

const HASH = "a".repeat(64);

function inventory(source: "legacy" | "configured") {
  const issuer = source === "configured"
    ? { issuerKey: "sanrio", name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360", boundaryHash: HASH }
    : { name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360" };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer,
    ...(source === "configured" ? { registryHash: HASH } : {}),
    range: { from: "2026-07-01", to: "2026-07-31" },
    generatedAt: "2026-08-09T15:00:00.000Z",
    completeness: "complete",
    scannedBusinessDays: 23,
    failedDates: [],
    candidates: [],
    ...(source === "configured" ? {
      factPromotionPolicy: "human_review_required",
      requireOfficialPdfVisualReview: true,
      inventoryHash: HASH,
    } : {}),
    appendAuthorized: false,
  };
}

const tmp = mkdtempSync(join(tmpdir(), "alpha-pon-sanrio-advisory-hardlink-"));
const root = join(tmp, "data", "edinet");
mkdirSync(root, { recursive: true });

const externalLegacy = join(tmp, "external-legacy.json");
writeFileSync(externalLegacy, `${JSON.stringify(inventory("legacy"))}\n`, "utf-8");
const before = readFileSync(externalLegacy, "utf-8");
linkSync(externalLegacy, join(root, "sanrio-edinet-inventory.legacy.2026.json"));
writeFileSync(
  join(root, "sanrio-edinet-inventory.configured.2026.json"),
  `${JSON.stringify(inventory("configured"))}\n`,
  "utf-8",
);

const original: SanrioRealPilotPreflightResult = {
  schemaVersion: 1,
  root,
  stage: "parity_inputs_required",
  nextCommand: "existing configured-review command",
  requiresHumanAction: true,
  missingInputs: [
    "green sanrio-edinet-inventory-compatibility-v1.*.json",
    "complete configured-human-comparison-record-v1.*.json",
  ],
  selectedFiles: {},
  warnings: [],
  safety: {
    rawContentPrinted: false,
    automaticReplacementAuthorized: false,
    foundationAppendAuthorized: false,
    automaticTradingAuthorized: false,
  },
};

const advised = addSanrioInventoryCompatibilityAdvisory(original, root);
assert.equal(advised.nextCommand, original.nextCommand, "hard-linked inventory must not authorize a read-only compatibility command");
assert.equal(advised.requiresHumanAction, true, "hard-linked inventory must remain fail-closed");
assert.equal(readFileSync(externalLegacy, "utf-8"), before, "external hard-link target must remain untouched");

console.log("edinet-sanrio-real-pilot-readiness-advisory-hardlink.test.ts passed");
