import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildEdinetIssuerRegistry } from "../src/research/edinet-issuer-boundary.js";
import { buildConfiguredEdinetReviewPlan } from "../src/research/edinet-configured-review-plan.js";

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

function registryFixture() {
  return {
    schemaVersion: 1,
    registryId: "edinet-issuer-boundary-v1",
    generatedAt: "2026-08-06T12:00:00Z",
    issuerCount: 1,
    issuers: [
      {
        issuerKey: "synthetic-co",
        name: "合成テスト株式会社",
        edinetCode: "E90000",
        secCode: "90000",
        aliases: ["合成テスト"],
        active: true,
        allowedDocumentTypes: ["1", "2"],
        storagePolicy: "local_only",
        factPromotionPolicy: "human_review_required",
        requireOfficialPdfVisualReview: true,
      },
    ],
  };
}

function inventoryFixture(submitDateTime: string) {
  const registry = buildEdinetIssuerRegistry(registryFixture());
  const boundary = registry.issuers[0]!;
  const base = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: registry.registryHash,
    issuer: {
      issuerKey: boundary.issuerKey,
      name: boundary.name,
      edinetCode: boundary.edinetCode,
      secCode: boundary.secCode,
      boundaryHash: boundary.boundaryHash,
    },
    range: { from: "2026-08-01", to: "2026-08-06" },
    completeness: "complete",
    failedDates: [],
    candidates: [
      {
        doc: {
          docID: "SYN001",
          edinetCode: boundary.edinetCode,
          secCode: boundary.secCode,
          submitDateTime,
          docDescription: "synthetic filing",
        },
        reviewPriority: "normal",
        reviewReasons: [],
        retrievableByLegalStatus: true,
        documentTypePlan: [{ type: "1" }, { type: "2" }],
      },
    ],
    lineage: {
      hasBlockingIssues: false,
      nodes: [{ docID: "SYN001", parentDocID: null, chainRootDocID: "SYN001" }],
    },
    factPromotionPolicy: "human_review_required",
    requireOfficialPdfVisualReview: true,
    appendAuthorized: false,
  };
  return { ...base, inventoryHash: digest(base) };
}

assert.throws(
  () => buildConfiguredEdinetReviewPlan({
    registry: registryFixture(),
    inventory: inventoryFixture("2026-08-06T11:00:00Z"),
    sourceInventoryFile: "inventory.json",
    generatedAt: "2026-08-06T13:20:00",
  }),
  /timezone|offset|ISO/i,
);

assert.throws(
  () => buildConfiguredEdinetReviewPlan({
    registry: registryFixture(),
    inventory: inventoryFixture("2026-08-06T11:00:00"),
    sourceInventoryFile: "inventory.json",
    generatedAt: "2026-08-06T13:20:00Z",
  }),
  /timezone|offset|ISO/i,
);

assert.throws(
  () => buildConfiguredEdinetReviewPlan({
    registry: registryFixture(),
    inventory: inventoryFixture("2026-02-30T11:00:00Z"),
    sourceInventoryFile: "inventory.json",
    generatedAt: "2026-08-06T13:20:00Z",
  }),
  /invalid|ISO|date/i,
);

console.log("edinet-configured-review-plan-instant.test.ts passed");
