import assert from "node:assert/strict";
import { normalizeWorldImpactReviewInputs } from "../src/world-impact-review-input.js";

const reflection = {
  eventId: "2026-08-19_future-event",
  createdAt: "2026-08-19",
  title: "future event",
  urgencyScore: 80,
  categories: ["technology"],
  impactedTags: ["AI"],
  thesis: "future evidence must not affect the current review",
  chainOfImpact: ["future"],
  possibleBeneficiaries: [],
  possibleRisks: [],
  evidenceNeeded: ["primary source"],
  invalidationSignals: ["not confirmed"],
};

const inputs = normalizeWorldImpactReviewInputs(
  [reflection, { ...reflection, eventId: "2026-08-18_current-event", createdAt: "2026-08-18" }],
  { candidates: [], universeCandidates: [], generatedCompanyRules: [] },
  "2026-08-18",
);

assert.equal(inputs.reflections.length, 1, "asOfより未来のreflectionをcurrent review evidenceへ混入させない");
assert.equal((inputs.reflections[0] as typeof reflection).createdAt, "2026-08-18", "asOf当日のreflectionは維持する");
assert.ok(inputs.warnings.some(warning => warning.includes("world_event_reflections_latest.json: invalid_rows") && warning.includes("dropped 1")));

console.log("world-impact review input: future reflectionをPIT cutoffで隔離する");
