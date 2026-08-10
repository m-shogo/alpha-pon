import assert from "node:assert/strict";
import { buildConfiguredEdinetDashboard } from "../src/research/edinet-configured-dashboard.js";

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

function input(generatedAt: string) {
  return {
    registry: registryFixture(),
    inventory: { issuer: { issuerKey: "synthetic-co" } },
    reviewPlan: {},
    acquisitionPlan: {},
    acquisitionManifest: {},
    reviewWorkspace: {},
    files: {
      inventory: "inventory.json",
      reviewPlan: "review-plan.json",
      acquisitionPlan: "acquisition-plan.json",
      acquisitionManifest: "acquisition-manifest.json",
      reviewWorkspace: "review-workspace.json",
    },
    generatedAt,
  };
}

assert.throws(
  () => buildConfiguredEdinetDashboard(input("2026-08-06T13:20:00")),
  /timezone|offset|ISO/i,
);
assert.throws(
  () => buildConfiguredEdinetDashboard(input("2026-02-30T13:20:00Z")),
  /invalid|ISO|date/i,
);

console.log("edinet-configured-dashboard-generated-at-instant.test.ts passed");
