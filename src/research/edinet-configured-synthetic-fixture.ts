import { createHash } from "node:crypto";
import type { EdinetDoc } from "../fetcher/edinet.js";
import {
  buildConfiguredEdinetAcquisitionManifest,
  buildConfiguredEdinetAcquisitionPlan,
  type ConfiguredEdinetAcquisitionSuccess,
} from "../fetcher/edinet-configured-acquisition.js";
import { buildConfiguredEdinetInventory } from "../fetcher/edinet-configured-pilot.js";
import { buildConfiguredEdinetDashboard, renderConfiguredEdinetDashboardHtml } from "./edinet-configured-dashboard.js";
import { buildConfiguredEdinetReviewPlan } from "./edinet-configured-review-plan.js";
import {
  buildConfiguredEdinetReviewWorkspace,
  renderConfiguredEdinetReviewWorkspace,
  type ConfiguredEdinetVerifiedFile,
} from "./edinet-configured-review-workspace.js";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
} from "./edinet-issuer-boundary.js";

type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetSyntheticFile = {
  scope: "root" | "acquisition" | "fixture";
  fileName: string;
  mediaType: "application/json" | "text/markdown" | "text/html" | "application/octet-stream";
  content: string;
  sha256: string;
  byteLength: number;
  synthetic: true;
};

export type ConfiguredEdinetSyntheticFixtureBundle = {
  schemaVersion: 1;
  fixtureId: "configured-edinet-synthetic-pipeline-v1";
  generatedAt: string;
  synthetic: true;
  networkUsed: false;
  credentialsRequired: false;
  realIssuerAuthorized: false;
  realFilingContentIncluded: false;
  registry: ReturnType<typeof buildEdinetIssuerRegistry>;
  inventory: ReturnType<typeof buildConfiguredEdinetInventory>;
  reviewPlan: ReturnType<typeof buildConfiguredEdinetReviewPlan>;
  acquisitionPlan: ReturnType<typeof buildConfiguredEdinetAcquisitionPlan>;
  acquisitionManifest: ReturnType<typeof buildConfiguredEdinetAcquisitionManifest>;
  reviewWorkspace: ReturnType<typeof buildConfiguredEdinetReviewWorkspace>;
  dashboard: ReturnType<typeof buildConfiguredEdinetDashboard>;
  files: ConfiguredEdinetSyntheticFile[];
  safetyAssertions: string[];
  foundationPreviewEligible: false;
  appendAuthorized: false;
  bundleHash: string;
};

const FIXTURE_TIMES = {
  registry: "2026-08-06T15:00:00.000Z",
  inventory: "2026-08-06T15:01:00.000Z",
  reviewPlan: "2026-08-06T15:02:00.000Z",
  acquisitionPlan: "2026-08-06T15:03:00.000Z",
  rootRetrieved: "2026-08-06T15:04:00.000Z",
  correctionRetrieved: "2026-08-06T15:05:00.000Z",
  manifest: "2026-08-06T15:06:00.000Z",
  workspace: "2026-08-06T15:07:00.000Z",
  dashboard: "2026-08-06T15:08:00.000Z",
  bundle: "2026-08-06T15:09:00.000Z",
} as const;

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

function contentDigest(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function syntheticRegistryInput() {
  return {
    schemaVersion: 1,
    registryId: "edinet-issuer-boundary-v1",
    generatedAt: FIXTURE_TIMES.registry,
    issuerCount: 1,
    issuers: [
      {
        issuerKey: "synthetic-co",
        name: "合成テスト株式会社",
        edinetCode: "E90000",
        secCode: "90000",
        aliases: ["合成テスト", "SYNTHETIC TEST CO., LTD."],
        active: true,
        allowedDocumentTypes: ["1", "2"],
        storagePolicy: "local_only",
        factPromotionPolicy: "human_review_required",
        requireOfficialPdfVisualReview: true,
      },
    ],
  };
}

function syntheticDocument(overrides: Partial<EdinetDoc> = {}): EdinetDoc {
  return {
    seqNumber: 1,
    docID: "S900ROOT",
    edinetCode: "E90000",
    secCode: "90000",
    JCN: "9000000000000",
    filerName: "合成テスト株式会社",
    fundCode: "",
    ordinanceCode: "010",
    formCode: "030000",
    docTypeCode: "120",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    submitDateTime: "2026-06-20T15:00:00+09:00",
    docDescription: "合成テスト有価証券報告書",
    issuerEdinetCode: "",
    subjectEdinetCode: "",
    subsidiaryEdinetCode: "",
    currentReportReason: "",
    parentDocID: "",
    opeDateTime: "2026-06-20T15:00:00+09:00",
    withdrawalStatus: "0",
    docInfoEditStatus: "0",
    disclosureStatus: "0",
    xbrlFlag: "1",
    pdfFlag: "1",
    attachDocFlag: "0",
    englishDocFlag: "0",
    csvFlag: "0",
    legalStatus: "1",
    ...overrides,
  };
}

function binaryContent(docID: string, documentType: "1" | "2"): string {
  return [
    "ALPHA PON SYNTHETIC EDINET FIXTURE",
    "NOT AN OFFICIAL FILING",
    "NO REAL ISSUER OR INVESTMENT FACTS",
    `docID=${docID}`,
    `documentType=${documentType}`,
    documentType === "1" ? "format=synthetic-zip-placeholder" : "format=synthetic-pdf-placeholder",
    "appendAuthorized=false",
    "",
  ].join("\n");
}

function file(input: Omit<ConfiguredEdinetSyntheticFile, "sha256" | "byteLength" | "synthetic">): ConfiguredEdinetSyntheticFile {
  return {
    ...input,
    sha256: contentDigest(input.content),
    byteLength: Buffer.byteLength(input.content, "utf-8"),
    synthetic: true,
  };
}

function metadataFor(input: {
  task: ReturnType<typeof buildConfiguredEdinetAcquisitionPlan>["tasks"][number];
  success: ConfiguredEdinetAcquisitionSuccess;
  registryHash: string;
  boundaryHash: string;
  sourceReviewPlanFile: string;
  sourceReviewPlanHash: string;
  acquisitionPlanHash: string;
}) {
  return {
    schemaVersion: 1,
    source: "edinet",
    registryHash: input.registryHash,
    issuerKey: "synthetic-co",
    boundaryHash: input.boundaryHash,
    sourceReviewPlanFile: input.sourceReviewPlanFile,
    sourceReviewPlanHash: input.sourceReviewPlanHash,
    acquisitionPlanHash: input.acquisitionPlanHash,
    docID: input.task.docID,
    documentType: input.task.documentType,
    format: input.task.format,
    reason: input.task.reason,
    sourceDocID: input.task.sourceDocID,
    parentOutsidePlan: false,
    byteLength: input.success.byteLength,
    sha256: input.success.sha256,
    contentType: input.task.documentType === "1" ? "application/zip" : "application/pdf",
    contentDisposition: `attachment; filename="${input.success.binaryFile}"`,
    retrievedAt: input.success.retrievedAt,
    sourceEndpoint: `https://api.edinet-fsa.go.jp/api/v2/documents/${input.task.docID}?type=${input.task.documentType}`,
    executionMode: "explicit_local_command",
    storageBoundary: "local_only",
    synthetic: true,
    realFilingContentIncluded: false,
    appendAuthorized: false,
  };
}

function fixtureReadme(bundle: Omit<ConfiguredEdinetSyntheticFixtureBundle, "files" | "bundleHash">): string {
  return `# Configured EDINET synthetic pipeline fixture v1

This directory is generated from deterministic synthetic metadata.

- synthetic: true
- networkUsed: false
- credentialsRequired: false
- realIssuerAuthorized: false
- realFilingContentIncluded: false
- issuerKey: ${bundle.inventory.issuer.issuerKey}
- EDINET/security code: ${bundle.inventory.issuer.edinetCode}/${bundle.inventory.issuer.secCode}
- pipeline stages: inventory → review plan → acquisition plan → manifest → workspace v2 → dashboard
- dashboard status: ${bundle.dashboard.dashboardStatus}
- appendAuthorized: false

The .zip and .pdf extensions are not used here. Synthetic binary payloads are plain text placeholders and must never be treated as official filings.
`;
}

export function buildConfiguredEdinetSyntheticFixture(): ConfiguredEdinetSyntheticFixtureBundle {
  const registryInput = syntheticRegistryInput();
  const registry = buildEdinetIssuerRegistry(registryInput);
  const boundary = resolveEdinetIssuerBoundary(registry, "synthetic-co");
  const root = syntheticDocument();
  const correction = syntheticDocument({
    seqNumber: 2,
    docID: "S900CORR",
    parentDocID: root.docID,
    formCode: "030001",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "合成テスト訂正有価証券報告書",
    currentReportReason: "合成fixtureの訂正関係確認",
  });
  const inventoryFile = "synthetic-co-edinet-inventory.fixture.json";
  const reviewPlanFile = "synthetic-co-edinet-configured-review-plan-v1.fixture.json";
  const acquisitionPlanFile = "acquisition-plan.json";
  const acquisitionManifestFile = "acquisition-manifest.json";
  const reviewWorkspaceFile = "configured-review-workspace-v2.json";
  const dashboardFile = "configured-pipeline-dashboard-v1.json";

  const inventory = buildConfiguredEdinetInventory({
    boundary,
    registryHash: registry.registryHash,
    from: "2026-01-01",
    to: "2026-08-06",
    generatedAt: FIXTURE_TIMES.inventory,
    scannedBusinessDays: 156,
    failedDates: [],
    docs: [root, correction],
  });
  const reviewPlan = buildConfiguredEdinetReviewPlan({
    inventory,
    registry: registryInput,
    sourceInventoryFile: inventoryFile,
    generatedAt: FIXTURE_TIMES.reviewPlan,
  });
  const acquisitionPlan = buildConfiguredEdinetAcquisitionPlan({
    reviewPlan,
    registry: registryInput,
    sourceReviewPlanFile: reviewPlanFile,
    generatedAt: FIXTURE_TIMES.acquisitionPlan,
  });

  const binaryFiles: ConfiguredEdinetSyntheticFile[] = [];
  const metadataFiles: ConfiguredEdinetSyntheticFile[] = [];
  const successes: ConfiguredEdinetAcquisitionSuccess[] = acquisitionPlan.tasks.map((task, index) => {
    const content = binaryContent(task.docID, task.documentType);
    const binary = file({
      scope: "acquisition",
      fileName: `${task.docID}.type-${task.documentType}.synthetic.bin`,
      mediaType: "application/octet-stream",
      content,
    });
    binaryFiles.push(binary);
    const retrievedAt = task.docID === "S900ROOT"
      ? FIXTURE_TIMES.rootRetrieved
      : FIXTURE_TIMES.correctionRetrieved;
    const success: ConfiguredEdinetAcquisitionSuccess = {
      task,
      binaryFile: binary.fileName,
      metadataFile: `${task.docID}.type-${task.documentType}.synthetic.metadata.json`,
      sha256: binary.sha256,
      byteLength: binary.byteLength,
      retrievedAt,
    };
    const metadata = metadataFor({
      task,
      success,
      registryHash: registry.registryHash,
      boundaryHash: boundary.boundaryHash,
      sourceReviewPlanFile: reviewPlanFile,
      sourceReviewPlanHash: reviewPlan.reviewPlanHash,
      acquisitionPlanHash: acquisitionPlan.planHash,
    });
    metadataFiles.push(file({
      scope: "acquisition",
      fileName: success.metadataFile,
      mediaType: "application/json",
      content: json(metadata),
    }));
    return success;
  });

  const acquisitionManifest = buildConfiguredEdinetAcquisitionManifest({
    plan: acquisitionPlan,
    generatedAt: FIXTURE_TIMES.manifest,
    outputDirectory: "synthetic-co-acquisition.fixture",
    succeeded: successes,
    failed: [],
  });
  const metadataByName = new Map(metadataFiles.map(item => [item.fileName, item]));
  const verifiedFiles: ConfiguredEdinetVerifiedFile[] = successes.map(success => {
    const metadata = metadataByName.get(success.metadataFile)!;
    return {
      binaryFile: success.binaryFile,
      metadataFile: success.metadataFile,
      binarySha256: success.sha256,
      binaryByteLength: success.byteLength,
      metadataSha256: metadata.sha256,
      metadataByteLength: metadata.byteLength,
    };
  });
  const reviewWorkspace = buildConfiguredEdinetReviewWorkspace({
    registry: registryInput,
    reviewPlan,
    acquisitionPlan,
    acquisitionManifest,
    verifiedFiles,
    sourceReviewPlanFile: reviewPlanFile,
    sourceAcquisitionPlanFile: acquisitionPlanFile,
    acquisitionManifestFile,
    generatedAt: FIXTURE_TIMES.workspace,
  });
  const dashboard = buildConfiguredEdinetDashboard({
    registry: registryInput,
    inventory,
    reviewPlan,
    acquisitionPlan,
    acquisitionManifest,
    reviewWorkspace,
    files: {
      inventory: inventoryFile,
      reviewPlan: reviewPlanFile,
      acquisitionPlan: acquisitionPlanFile,
      acquisitionManifest: acquisitionManifestFile,
      reviewWorkspace: reviewWorkspaceFile,
    },
    generatedAt: FIXTURE_TIMES.dashboard,
  });

  const withoutFilesAndHash = {
    schemaVersion: 1 as const,
    fixtureId: "configured-edinet-synthetic-pipeline-v1" as const,
    generatedAt: FIXTURE_TIMES.bundle,
    synthetic: true as const,
    networkUsed: false as const,
    credentialsRequired: false as const,
    realIssuerAuthorized: false as const,
    realFilingContentIncluded: false as const,
    registry,
    inventory,
    reviewPlan,
    acquisitionPlan,
    acquisitionManifest,
    reviewWorkspace,
    dashboard,
    safetyAssertions: [
      "all_issuer_and_document_identifiers_are_synthetic",
      "no_network_request_was_made",
      "no_credentials_are_required_or_embedded",
      "binary_payloads_are_plain_text_synthetic_placeholders",
      "no_real_filing_content_is_included",
      "automatic_acquisition_is_not_authorized",
      "human_filing_review_remains_pending",
      "foundation_and_evidence_append_are_not_authorized",
    ].sort(),
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };

  const files: ConfiguredEdinetSyntheticFile[] = [
    file({ scope: "fixture", fileName: "README.md", mediaType: "text/markdown", content: fixtureReadme(withoutFilesAndHash) }),
    file({ scope: "fixture", fileName: "synthetic-registry.json", mediaType: "application/json", content: json(registry) }),
    file({ scope: "root", fileName: inventoryFile, mediaType: "application/json", content: json(inventory) }),
    file({ scope: "root", fileName: reviewPlanFile, mediaType: "application/json", content: json(reviewPlan) }),
    file({ scope: "acquisition", fileName: acquisitionPlanFile, mediaType: "application/json", content: json(acquisitionPlan) }),
    ...binaryFiles,
    ...metadataFiles,
    file({ scope: "acquisition", fileName: acquisitionManifestFile, mediaType: "application/json", content: json(acquisitionManifest) }),
    file({ scope: "acquisition", fileName: reviewWorkspaceFile, mediaType: "application/json", content: json(reviewWorkspace) }),
    file({ scope: "acquisition", fileName: "configured-review-workspace-v2.md", mediaType: "text/markdown", content: renderConfiguredEdinetReviewWorkspace(reviewWorkspace) }),
    file({ scope: "acquisition", fileName: dashboardFile, mediaType: "application/json", content: json(dashboard) }),
    file({ scope: "acquisition", fileName: "configured-pipeline-dashboard-v1.html", mediaType: "text/html", content: renderConfiguredEdinetDashboardHtml(dashboard) }),
  ].sort((left, right) => `${left.scope}|${left.fileName}`.localeCompare(`${right.scope}|${right.fileName}`));

  const base = { ...withoutFilesAndHash, files };
  return { ...base, bundleHash: digest(base) };
}

export function renderConfiguredEdinetSyntheticFixtureManifest(
  bundle: ConfiguredEdinetSyntheticFixtureBundle,
): string {
  const lines = [
    "# Configured EDINET synthetic fixture manifest",
    "",
    `- fixtureId: ${bundle.fixtureId}`,
    `- generatedAt: ${bundle.generatedAt}`,
    `- issuer: ${bundle.inventory.issuer.name}`,
    `- issuerKey: ${bundle.inventory.issuer.issuerKey}`,
    `- EDINET/security code: ${bundle.inventory.issuer.edinetCode}/${bundle.inventory.issuer.secCode}`,
    `- registryHash: ${bundle.registry.registryHash}`,
    `- inventoryHash: ${bundle.inventory.inventoryHash}`,
    `- reviewPlanHash: ${bundle.reviewPlan.reviewPlanHash}`,
    `- acquisitionPlanHash: ${bundle.acquisitionPlan.planHash}`,
    `- acquisitionManifestHash: ${bundle.acquisitionManifest.manifestHash}`,
    `- reviewWorkspaceHash: ${bundle.reviewWorkspace.workspaceHash}`,
    `- dashboardHash: ${bundle.dashboard.dashboardHash}`,
    `- bundleHash: ${bundle.bundleHash}`,
    `- files: ${bundle.files.length}`,
    "- synthetic: true",
    "- networkUsed: false",
    "- realIssuerAuthorized: false",
    "- realFilingContentIncluded: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "## Files",
    "",
  ];
  for (const item of bundle.files) {
    lines.push(
      `- ${item.scope}/${item.fileName}`,
      `  - mediaType: ${item.mediaType}`,
      `  - byteLength: ${item.byteLength}`,
      `  - sha256: ${item.sha256}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
