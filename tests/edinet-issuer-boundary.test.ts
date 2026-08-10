import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertEdinetDocumentTypeAllowed,
  assertEdinetIssuerIdentity,
  buildEdinetIssuerRegistry,
  buildIssuerBoundaryEvidence,
  resolveEdinetIssuerBoundary,
} from "../src/research/edinet-issuer-boundary.js";

function registryFixture() {
  return {
    schemaVersion: 1,
    registryId: "edinet-issuer-boundary-v1",
    generatedAt: "2026-08-06T10:45:00.000Z",
    issuerCount: 2,
    issuers: [
      {
        issuerKey: "sanrio",
        name: "株式会社サンリオ",
        edinetCode: "E02655",
        secCode: "81360",
        aliases: ["サンリオ", "SANRIO CO., LTD."],
        active: true,
        allowedDocumentTypes: ["1", "2"],
        storagePolicy: "local_only",
        factPromotionPolicy: "human_review_required",
        requireOfficialPdfVisualReview: true,
      },
      {
        issuerKey: "fixture-inactive",
        name: "テスト株式会社",
        edinetCode: "E99999",
        secCode: "99990",
        aliases: ["テスト"],
        active: false,
        allowedDocumentTypes: ["1"],
        storagePolicy: "metadata_only_git",
        factPromotionPolicy: "human_review_required",
        requireOfficialPdfVisualReview: true,
      },
    ],
  };
}

{
  const configured = JSON.parse(
    readFileSync("config/research/edinet-issuer-registry.v1.json", "utf-8"),
  ) as unknown;
  const registry = buildEdinetIssuerRegistry(configured);
  assert.equal(registry.issuerCount, 1);
  const sanrio = resolveEdinetIssuerBoundary(registry, "sanrio");
  assert.equal(sanrio.edinetCode, "E02655");
  assert.equal(sanrio.secCode, "81360");
  assert.deepEqual(sanrio.allowedDocumentTypes, ["1", "2"]);
  assert.match(sanrio.boundaryHash, /^[a-f0-9]{64}$/);
  assert.match(registry.registryHash, /^[a-f0-9]{64}$/);
  assertEdinetIssuerIdentity(sanrio, {
    name: "サンリオ",
    edinetCode: "E02655",
    secCode: "81360",
    issuerKey: "sanrio",
  });
  assertEdinetDocumentTypeAllowed(sanrio, "1");
  assertEdinetDocumentTypeAllowed(sanrio, "2");
  assert.throws(() => assertEdinetDocumentTypeAllowed(sanrio, "5"), /is not allowed/);
  const evidence = buildIssuerBoundaryEvidence(sanrio);
  assert.equal(evidence.factPromotionPolicy, "human_review_required");
  assert.equal(evidence.requireOfficialPdfVisualReview, true);
  console.log("edinet-issuer-boundary: configured Sanrio registry and evidence OK");
}

{
  const registry = buildEdinetIssuerRegistry(registryFixture());
  const byCode = resolveEdinetIssuerBoundary(registry, "E02655");
  const bySecCode = resolveEdinetIssuerBoundary(registry, "81360");
  const byAlias = resolveEdinetIssuerBoundary(registry, "ＳＡＮＲＩＯ　ＣＯ．，　ＬＴＤ．");
  assert.equal(byCode.issuerKey, "sanrio");
  assert.equal(bySecCode.issuerKey, "sanrio");
  assert.equal(byAlias.issuerKey, "sanrio");
  assert.throws(() => resolveEdinetIssuerBoundary(registry, "unknown-company"), /not configured/);
  assert.throws(() => resolveEdinetIssuerBoundary(registry, "fixture-inactive"), /inactive/);
  const inactive = resolveEdinetIssuerBoundary(registry, "fixture-inactive", { requireActive: false });
  assert.equal(inactive.active, false);
  console.log("edinet-issuer-boundary: exact key/code/alias resolution and inactive gate OK");
}

{
  const duplicateCode = registryFixture();
  duplicateCode.issuers[1]!.edinetCode = "E02655";
  assert.throws(() => buildEdinetIssuerRegistry(duplicateCode), /duplicate edinetCode/);

  const duplicateSecCode = registryFixture();
  duplicateSecCode.issuers[1]!.secCode = "81360";
  assert.throws(() => buildEdinetIssuerRegistry(duplicateSecCode), /duplicate secCode/);

  const ambiguousAlias = registryFixture();
  ambiguousAlias.issuers[1]!.aliases = ["サンリオ"];
  assert.throws(() => buildEdinetIssuerRegistry(ambiguousAlias), /alias .* is ambiguous/);
  console.log("edinet-issuer-boundary: duplicate identity and ambiguous alias blocked OK");
}

{
  const registry = buildEdinetIssuerRegistry(registryFixture());
  const sanrio = resolveEdinetIssuerBoundary(registry, "sanrio");
  assert.throws(
    () => assertEdinetIssuerIdentity(sanrio, { edinetCode: "E99999", secCode: "81360" }),
    /edinetCode does not match/,
  );
  assert.throws(
    () => assertEdinetIssuerIdentity(sanrio, { name: "別会社" }),
    /not a configured alias/,
  );
  assert.throws(
    () => assertEdinetIssuerIdentity(sanrio, {}),
    /has no identity field/,
  );
  console.log("edinet-issuer-boundary: cross-issuer contamination blocked OK");
}

{
  const invalidPromotion = registryFixture();
  invalidPromotion.issuers[0]!.factPromotionPolicy = "automatic";
  assert.throws(() => buildEdinetIssuerRegistry(invalidPromotion), /human_review_required/);

  const noPdf = registryFixture();
  noPdf.issuers[0]!.requireOfficialPdfVisualReview = false;
  assert.throws(() => buildEdinetIssuerRegistry(noPdf), /must be true/);
  console.log("edinet-issuer-boundary: automatic promotion and PDF-review weakening blocked OK");
}

{
  const missingTimezone = registryFixture();
  missingTimezone.generatedAt = "2026-08-06T10:45:00";
  assert.throws(
    () => buildEdinetIssuerRegistry(missingTimezone),
    /explicit timezone|timezone offset|ISO/i,
  );

  const impossibleCalendarInstant = registryFixture();
  impossibleCalendarInstant.generatedAt = "2026-02-30T10:45:00Z";
  assert.throws(
    () => buildEdinetIssuerRegistry(impossibleCalendarInstant),
    /invalid|ISO|date/i,
  );
  console.log("edinet-issuer-boundary: strict generatedAt instant guards OK");
}

console.log("edinet-issuer-boundary.test.ts passed");
