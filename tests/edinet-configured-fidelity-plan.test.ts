import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetFidelityPlan,
  renderConfiguredEdinetFidelityPlan,
} from "../src/research/edinet-configured-fidelity-plan.js";
import { buildConfiguredEdinetSyntheticFixture } from "../src/research/edinet-configured-synthetic-fixture.js";

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

function rehashWorkspace(record: JsonObject): void {
  const { workspaceHash: _ignored, ...withoutHash } = record;
  record.workspaceHash = digest(withoutHash);
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const plan = buildConfiguredEdinetFidelityPlan({
    registry: fixture.registry,
    reviewWorkspace: fixture.reviewWorkspace,
    sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    generatedAt: "2026-08-06T15:10:00.000Z",
  });
  assert.equal(plan.issuer.issuerKey, "synthetic-co");
  assert.equal(plan.issuer.name, "合成テスト株式会社");
  assert.equal(plan.documentPairCount, 2);
  assert.equal(plan.anchorCount, 0);
  assert.equal(plan.anchorInputStatus, "pending_human_input");
  assert.equal(plan.extractionStatus, "not_started");
  assert.equal(plan.reviewStatus, "pending_source_fidelity_review");
  assert.equal(plan.automaticExtractionAuthorized, false);
  assert.equal(plan.foundationPreviewEligible, false);
  assert.equal(plan.appendAuthorized, false);
  assert.ok(plan.documents.every(document =>
    document.structuredSource.documentType === "1"
    && document.structuredSource.format === "zip"
    && document.officialPdf.documentType === "2"
    && document.officialPdf.format === "pdf"
    && document.anchorInput.anchorCount === 0
    && document.anchorInput.anchors.length === 0
    && document.extraction.structuredText === "not_started"
    && document.extraction.pdfText === "not_started"
    && document.extraction.automaticExecutionAuthorized === false
    && document.decisions.contentEquivalent === "unknown_pending_human_review",
  ));
  assert.ok(plan.documents.some(document =>
    document.parentDocID !== null
    && document.blockers.includes("parent_child_revision_comparison_required"),
  ));
  assert.ok(plan.documents.every(document => /^[a-f0-9]{64}$/.test(document.pairHash)));
  assert.match(plan.fidelityPlanHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetFidelityPlan(plan);
  assert.match(markdown, /does not extract text or decide equivalence/);
  assert.match(markdown, /anchors: 0\/1 required, max 40/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  assert.ok(!markdown.includes("100百万円"));
  console.log("edinet-configured-fidelity-plan: synthetic issuer type1/PDF pairs remain unextracted and undecided OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const tampered = structuredClone(fixture.reviewWorkspace) as unknown as JsonObject;
  tampered.documentCount = 99;
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: fixture.registry,
      reviewWorkspace: tampered,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    }),
    /reviewWorkspace\.workspaceHash mismatch/,
  );
  console.log("edinet-configured-fidelity-plan: workspace tampering blocked OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const missingPdf = structuredClone(fixture.reviewWorkspace) as unknown as JsonObject;
  const groups = missingPdf.groups as JsonObject[];
  const firstDocument = (groups[0]!.documents as JsonObject[])[0]!;
  firstDocument.acquisitions = (firstDocument.acquisitions as JsonObject[]).filter(
    acquisition => acquisition.documentType === "1",
  );
  firstDocument.officialPdfVerified = false;
  missingPdf.officialPdfCount = Number(missingPdf.officialPdfCount) - 1;
  rehashWorkspace(missingPdf);
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: fixture.registry,
      reviewWorkspace: missingPdf,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    }),
    /not fidelity-reviewable|exactly two acquisitions|requires type 1 and type 2/,
  );
  console.log("edinet-configured-fidelity-plan: validly rehashed missing PDF remains blocked OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const unsafe = structuredClone(fixture.reviewWorkspace) as unknown as JsonObject;
  unsafe.foundationPreviewEligible = true;
  rehashWorkspace(unsafe);
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: fixture.registry,
      reviewWorkspace: unsafe,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    }),
    /safety boundary is invalid/,
  );
  console.log("edinet-configured-fidelity-plan: unsafe Foundation boundary blocked OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const registryDrift = structuredClone(fixture.registry) as unknown as JsonObject;
  const issuers = registryDrift.issuers as JsonObject[];
  issuers[0]!.aliases = ["別名"];
  delete issuers[0]!.boundaryHash;
  delete registryDrift.registryHash;
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: registryDrift,
      reviewWorkspace: fixture.reviewWorkspace,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    }),
    /registryHash does not match configured registry/,
  );
  console.log("edinet-configured-fidelity-plan: registry drift blocked OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const crossed = structuredClone(fixture.reviewWorkspace) as unknown as JsonObject;
  const issuer = crossed.issuer as JsonObject;
  issuer.edinetCode = "E99999";
  rehashWorkspace(crossed);
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: fixture.registry,
      reviewWorkspace: crossed,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    }),
    /issuer identity does not match/,
  );
  console.log("edinet-configured-fidelity-plan: cross-issuer workspace blocked OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: fixture.registry,
      reviewWorkspace: fixture.reviewWorkspace,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
      generatedAt: "2026-08-06T15:10:00.000",
    }),
    /generatedAt must be an explicit ISO date-time/,
  );
  console.log("edinet-configured-fidelity-plan: timezone-less generatedAt blocked OK");
}

{
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const ambiguous = structuredClone(fixture.reviewWorkspace) as unknown as JsonObject;
  const groups = ambiguous.groups as JsonObject[];
  const firstDocument = (groups[0]!.documents as JsonObject[])[0]!;
  const acquisitions = firstDocument.acquisitions as JsonObject[];
  acquisitions[0]!.retrievedAt = "2026-08-06T15:00:00.000";
  rehashWorkspace(ambiguous);
  assert.throws(
    () => buildConfiguredEdinetFidelityPlan({
      registry: fixture.registry,
      reviewWorkspace: ambiguous,
      sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    }),
    /retrievedAt must be an explicit ISO date-time/,
  );
  console.log("edinet-configured-fidelity-plan: timezone-less acquisition retrievedAt blocked OK");
}

console.log("edinet-configured-fidelity-plan.test.ts passed");
