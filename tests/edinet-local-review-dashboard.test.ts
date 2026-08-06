import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildEdinetLocalReviewDashboard,
  renderEdinetLocalReviewDashboardHtml,
  type EdinetDashboardArtifactInput,
} from "../src/research/edinet-local-review-dashboard.js";

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

function issuer() {
  return {
    name: "株式会社サンリオ",
    edinetCode: "E02655",
    secCode: "81360",
  };
}

function batchWorkspace(input: {
  generatedAt: string;
  appendAuthorized?: boolean;
  blocker?: string;
}) {
  const appendAuthorized = input.appendAuthorized ?? false;
  const clusters = [
    {
      batchId: "batch:1",
      sourceClusterId: "cluster:1",
      logicalRoleKey: "notes/example",
      strategy: "review_representative_then_confirm_pair",
      reviewOrder: "representative_first",
      pairCoverage: 2,
      totalPairs: 2,
      candidateCount: 2,
      initialReviewCandidateIds: ["candidate:1"],
      deferredPairConfirmationCandidateIds: ["candidate:2"],
      reviewSignals: [],
      candidates: [],
      batchHash: "a".repeat(64),
    },
  ];
  const payload = {
    schemaVersion: 1,
    source: "edinet",
    sourceTriageWorkspaceHash: "b".repeat(64),
    clusters,
    appendAuthorized,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: issuer(),
    sourceTriageWorkspaceFile: "revision-diff-triage-v1.fixture.json",
    sourceTriageWorkspaceHash: payload.sourceTriageWorkspaceHash,
    generatedAt: input.generatedAt,
    sourceCandidateCount: 2,
    sourceClusterCount: 1,
    exceptionClusterCount: 0,
    representativeClusterCount: 1,
    initialReviewCandidateCount: 1,
    deferredPairConfirmationCount: 1,
    estimatedInitialReviewReduction: 1,
    reviewStatus: "pending_human_review",
    clusters,
    globalBlockers: [input.blocker ?? "human_review_required"],
    appendAuthorized,
    workspaceHash: digest(payload),
  };
}

function impactRecord(input: {
  generatedAt: string;
  appendAuthorized?: boolean;
  blocker?: string;
}) {
  const appendAuthorized = input.appendAuthorized ?? false;
  const base = {
    schemaVersion: 1,
    source: "edinet",
    issuer: issuer(),
    sourceContentBundleFile: "revision-review-next-content-v1.fixture.json",
    sourceContentBundleHash: "c".repeat(64),
    generatedAt: input.generatedAt,
    reviewer: "",
    reviewedAt: null,
    reviewStatus: "draft_human_input",
    candidateCount: 1,
    completedCandidateCount: 0,
    candidates: [],
    foundationPreviewEligible: false,
    appendAuthorized,
    globalBlockers: [input.blocker ?? "impact_review_required"],
  };
  return { ...base, recordHash: digest(base) };
}

function artifact(input: {
  fileName: string;
  content: unknown;
  modifiedAt: string;
  location?: "acquisition" | "root";
}): EdinetDashboardArtifactInput {
  return {
    fileName: input.fileName,
    content: input.content,
    modifiedAt: input.modifiedAt,
    location: input.location ?? "acquisition",
  };
}

{
  const dashboard = buildEdinetLocalReviewDashboard({
    acquisitionDirectory: "sanrio-acquisition.fixture",
    generatedAt: "2026-08-06T12:00:00.000Z",
    artifacts: [
      artifact({
        fileName: "revision-review-next-batches-v1.20260806T100000Z.json",
        content: batchWorkspace({ generatedAt: "2026-08-06T10:00:00.000Z" }),
        modifiedAt: "2026-08-06T10:00:01.000Z",
      }),
      artifact({
        fileName: "revision-review-next-batches-v1.20260806T110000Z.json",
        content: batchWorkspace({ generatedAt: "2026-08-06T11:00:00.000Z" }),
        modifiedAt: "2026-08-06T11:00:01.000Z",
      }),
      artifact({
        fileName: "revision-impact-review-input-v1.20260806T113000Z.json",
        content: impactRecord({
          generatedAt: "2026-08-06T11:30:00.000Z",
          blocker: "<script>alert('unsafe')</script>",
        }),
        modifiedAt: "2026-08-06T11:30:01.000Z",
      }),
      artifact({
        fileName: "unknown-local-file.json",
        content: { secret: "must not appear" },
        modifiedAt: "2026-08-06T11:40:00.000Z",
      }),
    ],
  });

  assert.equal(dashboard.recognizedArtifactCount, 3);
  assert.equal(dashboard.latestStageCount, 2);
  assert.equal(dashboard.verifiedArtifactCount, 2);
  assert.equal(dashboard.invalidIntegrityCount, 0);
  assert.equal(dashboard.unsafeBoundaryCount, 0);
  assert.equal(dashboard.pendingHumanReviewCount, 2);
  assert.equal(dashboard.dashboardStatus, "pending_human_review");
  assert.equal(dashboard.appendAuthorized, false);
  const batch = dashboard.stages.find(stage => stage.kind === "review_next_batches")!;
  assert.equal(batch.fileName, "revision-review-next-batches-v1.20260806T110000Z.json");
  assert.equal(batch.historyCount, 2);
  assert.equal(batch.counts.initialReviewCandidateCount, 1);
  assert.match(dashboard.dashboardHash, /^[a-f0-9]{64}$/);

  const html = renderEdinetLocalReviewDashboardHtml(dashboard);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("must not appear"));
  assert.ok(!html.includes("<script>alert('unsafe')</script>"));
  assert.match(html, /&lt;script&gt;alert\(&#39;unsafe&#39;\)&lt;\/script&gt;/);
  assert.match(html, /read-only/);
  assert.match(html, /appendAuthorized/);
  console.log("edinet-local-review-dashboard: latest-stage selection, verified hashes, CSP and escaping OK");
}

{
  const tampered = batchWorkspace({ generatedAt: "2026-08-06T11:00:00.000Z" });
  tampered.clusters[0]!.logicalRoleKey = "notes/tampered";
  const dashboard = buildEdinetLocalReviewDashboard({
    acquisitionDirectory: "sanrio-acquisition.fixture",
    generatedAt: "2026-08-06T12:00:00.000Z",
    artifacts: [
      artifact({
        fileName: "revision-review-next-batches-v1.20260806T110000Z.json",
        content: tampered,
        modifiedAt: "2026-08-06T11:00:01.000Z",
      }),
    ],
  });
  assert.equal(dashboard.invalidIntegrityCount, 1);
  assert.equal(dashboard.dashboardStatus, "blocked_integrity");
  assert.ok(dashboard.stages[0]!.issues.includes("workspaceHash_mismatch"));
  console.log("edinet-local-review-dashboard: hash-covered tampering blocks dashboard OK");
}

{
  const unsafe = impactRecord({
    generatedAt: "2026-08-06T11:30:00.000Z",
    appendAuthorized: true,
  });
  const dashboard = buildEdinetLocalReviewDashboard({
    acquisitionDirectory: "sanrio-acquisition.fixture",
    generatedAt: "2026-08-06T12:00:00.000Z",
    artifacts: [
      artifact({
        fileName: "revision-impact-review-input-v1.20260806T113000Z.json",
        content: unsafe,
        modifiedAt: "2026-08-06T11:30:01.000Z",
      }),
    ],
  });
  assert.equal(dashboard.invalidIntegrityCount, 0);
  assert.equal(dashboard.unsafeBoundaryCount, 1);
  assert.equal(dashboard.dashboardStatus, "blocked_boundary");
  assert.ok(dashboard.stages[0]!.issues.includes("append_boundary_is_not_false"));
  console.log("edinet-local-review-dashboard: unsafe append boundary blocks dashboard OK");
}

{
  assert.throws(
    () => buildEdinetLocalReviewDashboard({
      acquisitionDirectory: "other-acquisition",
      artifacts: [],
    }),
    /Sanrio acquisition basename/,
  );
  console.log("edinet-local-review-dashboard: acquisition boundary enforced OK");
}

console.log("edinet-local-review-dashboard.test.ts passed");
