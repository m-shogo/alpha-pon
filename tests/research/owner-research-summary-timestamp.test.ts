import assert from "node:assert/strict";
import {
  isOwnerResearchSummaryCountConsistent,
  isOwnerResearchTimestampSafe,
} from "../../apps/web/lib/research-summary.js";

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

console.log("research/owner summary: timestamp and count-consistency contracts OK");
