import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSanrioConfiguredAdvisoryIntegrity } from "../src/research/edinet-sanrio-configured-advisory-integrity.js";
import type { SanrioRealPilotPreflightResult } from "../src/research/edinet-sanrio-real-pilot-preflight.js";

type JsonObject = Record<string, unknown>;

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

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function fixture(hashOverride?: string): {
  root: string;
  comparisonRelative: string;
  inputRelative: string;
  result: SanrioRealPilotPreflightResult;
} {
  const base = mkdtempSync(join(tmpdir(), "alpha-pon-configured-advisory-integrity-"));
  const root = join(base, "data", "edinet");
  const acquisition = join(root, "sanrio-acquisition.20260809T150000Z");
  mkdirSync(acquisition, { recursive: true });

  const comparisonName = "configured-fidelity-exact-comparison-v1.20260809T150300Z.json";
  const comparisonBase = {
    schemaVersion: 1,
    source: "edinet",
    normalizationVersion: "unicode-nfkc-horizontal-whitespace-v1",
    comparisonMethod: "exact_normalized_only",
    executionMode: "explicit_local_command",
    registryHash: "a".repeat(64),
    issuer: {
      issuerKey: "sanrio",
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
      boundaryHash: "b".repeat(64),
    },
    sourceAnchorFinalFile: "configured-anchor-final-v1.synthetic.json",
    sourceAnchorFinalHash: "c".repeat(64),
    generatedAt: "2026-08-09T15:03:00+09:00",
    reviewer: "synthetic-test",
    reviewedAt: "2026-08-09T15:02:00+09:00",
    documentCount: 1,
    anchorCount: 1,
    exactNormalizedMatchCount: 1,
    mismatchPendingVisualReviewCount: 0,
    comparisonStatus: "complete_exact_normalized_comparison",
    reviewStatus: "pending_human_comparison_review",
    documents: [],
    globalBlockers: [],
    fuzzyMatchingUsed: false,
    semanticEquivalenceInferred: false,
    officialPdfVisualReviewComplete: false,
    automaticEquivalenceDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const comparisonHash = digest(comparisonBase);
  writeJson(join(acquisition, comparisonName), {
    ...comparisonBase,
    reportHash: hashOverride ?? comparisonHash,
  });

  const inputName = "configured-human-comparison-input-v1.20260809T150400Z.json";
  const inputBase = {
    schemaVersion: 1,
    source: "edinet",
    sourceComparisonFile: comparisonName,
    sourceComparisonHash: comparisonHash,
    reviewStatus: "draft_human_input",
    automaticFactPromotionAuthorized: false,
    automaticImpactDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  writeJson(join(acquisition, inputName), {
    ...inputBase,
    recordHash: digest(inputBase),
  });

  const comparisonRelative = `sanrio-acquisition.20260809T150000Z/${comparisonName}`;
  const inputRelative = `sanrio-acquisition.20260809T150000Z/${inputName}`;
  const result: SanrioRealPilotPreflightResult = {
    schemaVersion: 1,
    root,
    stage: "parity_inputs_required",
    nextCommand: "synthetic read-only advisory",
    requiresHumanAction: true,
    missingInputs: ["complete configured-human-comparison-record-v1.*.json"],
    selectedFiles: {
      configuredComparison: comparisonRelative,
      configuredHumanReviewInput: inputRelative,
    },
    warnings: [],
    safety: {
      rawContentPrinted: false,
      automaticReplacementAuthorized: false,
      foundationAppendAuthorized: false,
      automaticTradingAuthorized: false,
    },
  };
  return { root, comparisonRelative, inputRelative, result };
}

{
  const { root, result } = fixture("d".repeat(64));
  assert.throws(
    () => assertSanrioConfiguredAdvisoryIntegrity(result, root),
    /configuredComparison\.reportHash mismatch/,
  );
  console.log("edinet-sanrio-configured-advisory-integrity: bad comparison hash fails closed OK");
}

{
  const { root, result } = fixture();
  assert.doesNotThrow(() => assertSanrioConfiguredAdvisoryIntegrity(result, root));
  console.log("edinet-sanrio-configured-advisory-integrity: valid comparison and input lineage passes OK");
}

{
  const { root, result } = fixture();
  result.selectedFiles.configuredHumanReviewInput = undefined;
  assert.doesNotThrow(() => assertSanrioConfiguredAdvisoryIntegrity(result, root));
  console.log("edinet-sanrio-configured-advisory-integrity: comparison-only template advisory passes OK");
}

console.log("edinet-sanrio-configured-advisory-integrity.test.ts passed");
