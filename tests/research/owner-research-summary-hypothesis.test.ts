import assert from "node:assert/strict";
import { isOwnerResearchSummaryHypothesisSafe } from "../../apps/web/lib/research-summary-hypothesis.js";

const canonical = {
  formalEdges: [{
    hypothesis: "最初の仮説です。二つ目の説明です。三つ目はpreviewに含めません。",
    hypothesisPreview: "最初の仮説です。二つ目の説明です。",
  }],
};

assert.equal(
  isOwnerResearchSummaryHypothesisSafe(canonical),
  true,
  "canonical hypothesis preview must be derived from the projected full hypothesis",
);

assert.equal(
  isOwnerResearchSummaryHypothesisSafe({
    formalEdges: [{
      ...canonical.formalEdges[0],
      hypothesisPreview: "別の仮説を表示してしまう壊れたpreview",
    }],
  }),
  false,
  "a hypothesis preview that contradicts the full projected hypothesis must fail closed",
);

const longHypothesis = `${"A".repeat(280)}。後続文です。`;
assert.equal(
  isOwnerResearchSummaryHypothesisSafe({
    formalEdges: [{
      hypothesis: longHypothesis,
      hypothesisPreview: `${"A".repeat(259)}…`,
    }],
  }),
  true,
  "canonical preview truncation must remain deterministic at 260 characters",
);

console.log("research/owner summary: hypothesis preview consistency contract OK");
