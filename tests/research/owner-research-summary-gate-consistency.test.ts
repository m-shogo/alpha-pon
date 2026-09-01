import assert from "node:assert/strict";
import { isOwnerResearchSummaryGateSafe } from "../../apps/web/lib/research-summary-gates.js";

const safe = {
  formalEdges: [{
    gate: { pass: 8, fail: 1, unknown: 2, total: 11 },
    verificationGaps: [
      { key: "holdoutPass", state: "fail" },
      { key: "decayChecked", state: "unknown" },
      { key: "falseDiscoveryGuard", state: "unknown" },
    ],
  }],
};

assert.equal(
  isOwnerResearchSummaryGateSafe(safe),
  true,
  "canonical gate counts and non-pass gaps must be accepted",
);

for (const contradictory of [
  {
    formalEdges: [{
      ...safe.formalEdges[0],
      gate: { pass: 9, fail: 1, unknown: 1, total: 11 },
    }],
  },
  {
    formalEdges: [{
      ...safe.formalEdges[0],
      verificationGaps: [
        { key: "holdoutPass", state: "fail" },
        { key: "holdoutPass", state: "unknown" },
        { key: "falseDiscoveryGuard", state: "unknown" },
      ],
    }],
  },
  {
    formalEdges: [{
      ...safe.formalEdges[0],
      verificationGaps: [
        { key: "holdoutPass", state: "pass" },
        { key: "decayChecked", state: "unknown" },
        { key: "falseDiscoveryGuard", state: "unknown" },
      ],
    }],
  },
  {
    formalEdges: [{
      gate: { pass: 12, fail: 0, unknown: 0, total: 12 },
      verificationGaps: [],
    }],
  },
  {
    formalEdges: [{
      ...safe.formalEdges[0],
      verificationGaps: [
        { key: "notACanonicalGate", state: "fail" },
        { key: "decayChecked", state: "unknown" },
        { key: "falseDiscoveryGuard", state: "unknown" },
      ],
    }],
  },
]) {
  assert.equal(
    isOwnerResearchSummaryGateSafe(contradictory),
    false,
    "contradictory gate totals, states, keys, or gap counts must fail closed",
  );
}

console.log("research/owner summary: gate projection consistency contract OK");
