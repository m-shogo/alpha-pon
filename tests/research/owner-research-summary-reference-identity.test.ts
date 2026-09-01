import assert from "node:assert/strict";
import { isOwnerResearchSummaryReferenceSafe } from "../../apps/web/lib/research-summary-references.js";

const safe = {
  overview: {
    readiness: {
      promotionReadyEdgeIds: ["EDGE-001"],
      holdoutReadyEdgeIds: ["EDGE-002"],
    },
  },
  researchItems: [
    {
      id: "ITEM-001",
      families: [{ id: "FAMILY-001" }],
      questions: [{ id: "QUESTION-001" }],
    },
    {
      id: "ITEM-002",
      families: [{ id: "FAMILY-001" }],
      questions: [{ id: "QUESTION-002" }],
    },
  ],
  formalEdges: [{ id: "EDGE-001" }, { id: "EDGE-002" }],
};

assert.equal(isOwnerResearchSummaryReferenceSafe(safe), true);

for (const contradictory of [
  {
    ...safe,
    researchItems: [safe.researchItems[0], { ...safe.researchItems[1], id: "ITEM-001" }],
  },
  {
    ...safe,
    researchItems: [
      { ...safe.researchItems[0], families: [{ id: "FAMILY-001" }, { id: "FAMILY-001" }] },
      safe.researchItems[1],
    ],
  },
  {
    ...safe,
    researchItems: [
      { ...safe.researchItems[0], questions: [{ id: "QUESTION-001" }, { id: "QUESTION-001" }] },
      safe.researchItems[1],
    ],
  },
]) {
  assert.equal(
    isOwnerResearchSummaryReferenceSafe(contradictory),
    false,
    "duplicate canonical research identities must fail closed",
  );
}

console.log("research/owner summary: research identity uniqueness contract OK");
