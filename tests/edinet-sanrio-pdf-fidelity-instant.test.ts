import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildSanrioEdinetPdfFidelityPlan,
  buildSanrioEdinetPdfFidelityReport,
  type SanrioEdinetPdfFidelityPlan,
} from "../src/research/edinet-sanrio-pdf-fidelity-review.js";

type JsonObject = Record<string, unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function emptyFocusedBundle() {
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360" },
    focusedPlanHash: "1".repeat(64),
    candidateCount: 0,
    reviewStatus: "pending_human_review",
    candidates: [],
    appendAuthorized: false,
  };
  return {
    ...base,
    focusedBundleHash: digest({
      schemaVersion: base.schemaVersion,
      source: base.source,
      focusedPlanHash: base.focusedPlanHash,
      candidates: base.candidates,
      appendAuthorized: base.appendAuthorized,
    }),
  };
}

function reviewWorkspace(retrievedAt: string) {
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: { name: "株式会社サンリオ", edinetCode: "E02655", secCode: "81360" },
    reviewStatus: "pending_human_review",
    groups: [{
      documents: [{
        docID: "S100TEST1",
        acquisitions: [{
          documentType: "2",
          format: "pdf",
          binaryFile: "S100TEST1.type2.pdf",
          sha256: "a".repeat(64),
          byteLength: 1,
          retrievedAt,
        }],
      }],
    }],
    appendAuthorized: false,
  };
  return {
    ...base,
    workspaceHash: createHash("sha256").update(JSON.stringify(base)).digest("hex"),
  };
}

function emptyPlan(): SanrioEdinetPdfFidelityPlan {
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: { name: "株式会社サンリオ" as const, edinetCode: "E02655" as const, secCode: "81360" as const },
    sourceFocusedBundleFile: "focused.json",
    sourceFocusedBundleHash: "1".repeat(64),
    sourceReviewWorkspaceFile: "review.json",
    sourceReviewWorkspaceHash: "2".repeat(64),
    candidateCount: 0,
    uniquePdfCount: 0,
    candidates: [],
    appendAuthorized: false as const,
  };
  return { ...base, fidelityPlanHash: digest(base) };
}

for (const invalid of ["2026-08-06T09:00:00", "2026-02-30T09:00:00Z"]) {
  assert.throws(
    () => buildSanrioEdinetPdfFidelityPlan({
      focusedBundle: emptyFocusedBundle(),
      sourceFocusedBundleFile: "focused.json",
      reviewWorkspace: reviewWorkspace(invalid),
      sourceReviewWorkspaceFile: "review.json",
    }),
    /PDF S100TEST1\.retrievedAt must/,
  );

  assert.throws(
    () => buildSanrioEdinetPdfFidelityReport({
      plan: emptyPlan(),
      pdfTexts: [],
      generatedAt: invalid,
    }),
    /generatedAt must/,
  );
}

const validPlan = buildSanrioEdinetPdfFidelityPlan({
  focusedBundle: emptyFocusedBundle(),
  sourceFocusedBundleFile: "focused.json",
  reviewWorkspace: reviewWorkspace("2026-08-06T18:00:00+09:00"),
  sourceReviewWorkspaceFile: "review.json",
});
assert.equal(validPlan.candidateCount, 0);
const validReport = buildSanrioEdinetPdfFidelityReport({
  plan: emptyPlan(),
  pdfTexts: [],
  generatedAt: "2026-08-06T18:00:00+09:00",
});
assert.equal(validReport.generatedAt, "2026-08-06T18:00:00+09:00");

console.log("edinet-sanrio-pdf-fidelity-instant.test.ts passed");
