import assert from "node:assert/strict";
import { isOwnerResearchSummaryReferenceSafe } from "../../apps/web/lib/research-summary-references.js";
import {
  isOwnerResearchSummaryCountConsistent,
  isOwnerResearchTimestampSafe,
} from "../../apps/web/lib/research-summary.js";
import { isOwnerResearchSummaryTemporalSafe } from "../../apps/web/lib/research-summary-temporal.js";
import { isOwnerResearchSummaryWindowSafe } from "../../apps/web/lib/research-summary-window.js";

const now = Date.parse("2026-08-30T12:00:00.000Z");

assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30T11:59:59.999Z", now),
  true,
  "a valid timestamp before the evaluation time must be accepted",
);
assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30T21:00:00+09:00", now),
  true,
  "an equivalent timestamp with an explicit offset must be accepted",
);
assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30T12:00:00.001Z", now),
  false,
  "a future-dated timestamp must fail closed",
);
assert.equal(
  isOwnerResearchTimestampSafe("not-a-timestamp", now),
  false,
  "a malformed timestamp must fail closed",
);
assert.equal(
  isOwnerResearchTimestampSafe("2026-08-30", now),
  false,
  "a date without an explicit time zone must fail closed",
);

const temporallyConsistentSummary = {
  generatedAt: "2026-08-30T12:00:00.000Z",
  latestResearchAt: "2026-08-30T11:45:00.000Z",
  researchItems: [{
    createdAt: "2026-08-28T09:00:00.000Z",
    lastReviewedAt: "2026-08-30T11:30:00.000Z",
    questions: [{
      createdAt: "2026-08-28T09:05:00.000Z",
      lastReviewedAt: "2026-08-30T11:35:00.000Z",
    }],
  }],
  formalEdges: [{
    lastUpdate: "2026-08-30T11:40:00.000Z",
    lastResearchAt: "2026-08-30T11:45:00.000Z",
  }],
  timeline: [{ at: "2026-08-30T11:45:00.000Z" }],
  checkpoint: { savedAt: "2026-08-30T11:50:00.000Z" },
} as unknown as Parameters<typeof isOwnerResearchSummaryTemporalSafe>[0];

assert.equal(
  isOwnerResearchSummaryTemporalSafe(temporallyConsistentSummary, now),
  true,
  "nested Owner Summary timestamps at or before generation must be accepted",
);

for (const contradictory of [
  { ...temporallyConsistentSummary, latestResearchAt: "2026-08-30T12:00:00.001Z" },
  {
    ...temporallyConsistentSummary,
    researchItems: [{ ...temporallyConsistentSummary.researchItems[0], createdAt: "2026-08-30T12:00:00.001Z" }],
  },
  {
    ...temporallyConsistentSummary,
    researchItems: [{ ...temporallyConsistentSummary.researchItems[0], lastReviewedAt: "2026-08-30" }],
  },
  {
    ...temporallyConsistentSummary,
    researchItems: [{
      ...temporallyConsistentSummary.researchItems[0],
      questions: [{ ...temporallyConsistentSummary.researchItems[0].questions[0], createdAt: "not-a-timestamp" }],
    }],
  },
  {
    ...temporallyConsistentSummary,
    researchItems: [{
      ...temporallyConsistentSummary.researchItems[0],
      questions: [{ ...temporallyConsistentSummary.researchItems[0].questions[0], lastReviewedAt: "2026-08-30T12:00:00.001Z" }],
    }],
  },
  {
    ...temporallyConsistentSummary,
    formalEdges: [{ ...temporallyConsistentSummary.formalEdges[0], lastUpdate: "2026-08-30T12:00:00.001Z" }],
  },
  {
    ...temporallyConsistentSummary,
    formalEdges: [{ ...temporallyConsistentSummary.formalEdges[0], lastResearchAt: "2026-08-30" }],
  },
  { ...temporallyConsistentSummary, timeline: [{ at: "2026-08-30T12:00:00.001Z" }] },
  { ...temporallyConsistentSummary, timeline: [{ at: "not-a-timestamp" }] },
  { ...temporallyConsistentSummary, checkpoint: { savedAt: "2026-08-30T12:00:00.001Z" } },
  { ...temporallyConsistentSummary, checkpoint: { savedAt: "2026-08-30" } },
]) {
  assert.equal(
    isOwnerResearchSummaryTemporalSafe(
      contradictory as Parameters<typeof isOwnerResearchSummaryTemporalSafe>[0],
      now,
    ),
    false,
    "Owner Summary temporal contradictions must fail closed",
  );
}

const consistentSummaryCounts = {
  counts: {
    researchItems: 2,
    activeResearchItems: 1,
    formalEdges: 3,
    activeFormalEdges: 2,
  },
  researchItems: [
    { status: "investigating" as const },
    { status: "resolved" as const },
  ],
  formalEdges: [
    { status: "research" as const },
    { status: "shadow" as const },
    { status: "rejected" as const },
  ],
  overview: {
    edgeStatus: {
      research: 1,
      shadow: 1,
      production: 0,
      idea: 0,
      rejected: 1,
      deprecated: 0,
    },
  },
};

assert.equal(
  isOwnerResearchSummaryCountConsistent(consistentSummaryCounts),
  true,
  "canonical Owner Summary counts must agree with projected items, edges, and edge-status buckets",
);

for (const contradictory of [
  { ...consistentSummaryCounts, counts: { ...consistentSummaryCounts.counts, researchItems: 3 } },
  { ...consistentSummaryCounts, counts: { ...consistentSummaryCounts.counts, activeResearchItems: 2 } },
  { ...consistentSummaryCounts, counts: { ...consistentSummaryCounts.counts, formalEdges: 4 } },
  { ...consistentSummaryCounts, counts: { ...consistentSummaryCounts.counts, activeFormalEdges: 3 } },
  {
    ...consistentSummaryCounts,
    overview: {
      edgeStatus: { ...consistentSummaryCounts.overview.edgeStatus, research: 0, idea: 1 },
    },
  },
]) {
  assert.equal(
    isOwnerResearchSummaryCountConsistent(contradictory),
    false,
    "contradictory Owner Summary counts must fail closed",
  );
}

const referenceSafeSummary = {
  overview: {
    readiness: {
      promotionReadyEdgeIds: ["EDGE-001"],
      holdoutReadyEdgeIds: ["EDGE-002"],
    },
  },
  formalEdges: [{ id: "EDGE-001" }, { id: "EDGE-002" }],
};

assert.equal(
  isOwnerResearchSummaryReferenceSafe(referenceSafeSummary),
  true,
  "readiness references produced from canonical formal edges must be accepted",
);

for (const contradictory of [
  {
    ...referenceSafeSummary,
    overview: {
      readiness: {
        ...referenceSafeSummary.overview.readiness,
        promotionReadyEdgeIds: ["EDGE-GHOST"],
      },
    },
  },
  {
    ...referenceSafeSummary,
    overview: {
      readiness: {
        ...referenceSafeSummary.overview.readiness,
        holdoutReadyEdgeIds: ["EDGE-002", "EDGE-002"],
      },
    },
  },
]) {
  assert.equal(
    isOwnerResearchSummaryReferenceSafe(contradictory),
    false,
    "ghost or duplicated readiness edge references must fail closed",
  );
}

const windowSafeSummary = {
  overview: {
    asOf: "2026-08-30",
    recent7d: {
      from: "2026-08-24",
      to: "2026-08-30",
    },
  },
};

assert.equal(
  isOwnerResearchSummaryWindowSafe(windowSafeSummary),
  true,
  "canonical seven-day Owner Summary window must be accepted",
);

for (const contradictory of [
  { ...windowSafeSummary, overview: { ...windowSafeSummary.overview, asOf: "2026-02-30" } },
  {
    ...windowSafeSummary,
    overview: {
      ...windowSafeSummary.overview,
      recent7d: { ...windowSafeSummary.overview.recent7d, to: "2026-08-29" },
    },
  },
  {
    ...windowSafeSummary,
    overview: {
      ...windowSafeSummary.overview,
      recent7d: { ...windowSafeSummary.overview.recent7d, from: "2026-08-23" },
    },
  },
]) {
  assert.equal(
    isOwnerResearchSummaryWindowSafe(contradictory),
    false,
    "malformed or contradictory Owner Summary seven-day windows must fail closed",
  );
}

console.log("research/owner summary: timestamp, temporal, count, reference and window-consistency contracts OK");
