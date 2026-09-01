import assert from "node:assert/strict";
import { isOwnerResearchSummarySampleSafe } from "../../apps/web/lib/research-summary-samples.js";

const canonical = {
  overview: {
    recent7d: {
      currentFormalSamples: 7,
    },
  },
  formalEdges: [
    { samples: { current: 3 } },
    { samples: { current: 4 } },
  ],
};

assert.equal(
  isOwnerResearchSummarySampleSafe(canonical),
  true,
  "canonical currentFormalSamples must equal the sum projected by formalEdges",
);

assert.equal(
  isOwnerResearchSummarySampleSafe({
    ...canonical,
    overview: {
      recent7d: {
        currentFormalSamples: 8,
      },
    },
  }),
  false,
  "contradictory currentFormalSamples must fail closed",
);

console.log("research/owner summary: current formal sample consistency contract OK");
