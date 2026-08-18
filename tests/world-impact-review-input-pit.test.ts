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
  {
    candidates: [
      { code: "8136", name: "Sanrio" },
      { code: " 8136", name: "Sanrio padded" },
      { code: "8136 ", name: "Sanrio padded trailing" },
      { code: "8136", name: "Sanrio duplicate" },
    ],
    universeCandidates: [
      { code: "8136", name: "Sanrio universe duplicate" },
      { code: "7203", name: "Toyota" },
    ],
    generatedCompanyRules: [
      { code: "8136", name: "Sanrio", reasons: ["first canonical rule"] },
      { code: "8136", name: "Sanrio duplicate", reasons: ["later duplicate must not win"] },
      { code: " 8136", name: "Sanrio padded", reasons: ["noncanonical identity"] },
      { name: "legacy code-less rule", reasons: ["ignored by rule map"] },
    ],
  },
  "2026-08-18",
);

assert.equal(inputs.reflections.length, 1, "asOfより未来のreflectionをcurrent review evidenceへ混入させない");
assert.equal((inputs.reflections[0] as typeof reflection).createdAt, "2026-08-18", "asOf当日のreflectionは維持する");
assert.ok(inputs.warnings.some(warning => warning.includes("world_event_reflections_latest.json: invalid_rows") && warning.includes("dropped 1")));

assert.equal(inputs.candidates.length, 1, "前後空白付き・重複candidate codeを別identityとしてreviewへ混入させない");
assert.equal((inputs.candidates[0] as { code: string }).code, "8136", "最初のcanonical candidate codeを維持する");
assert.equal(inputs.universeCandidates.length, 1, "candidate側と重複するuniverse codeを二重reviewへ混入させない");
assert.equal((inputs.universeCandidates[0] as { code: string }).code, "7203", "別identityのuniverse candidateは維持する");
assert.ok(inputs.warnings.some(warning => warning.includes("alpha-pon-data.json.candidates: invalid_rows") && warning.includes("dropped 2")));
assert.ok(inputs.warnings.some(warning => warning.includes("alpha-pon-data.json.candidates: duplicate_identity") && warning.includes("dropped 1")));
assert.ok(inputs.warnings.some(warning => warning.includes("alpha-pon-data.json.universeCandidates: duplicate_identity") && warning.includes("dropped 1")));

assert.equal(inputs.generatedCompanyRules.length, 2, "重複・非canonical company rule codeを後勝ちMapへ渡さない");
assert.equal((inputs.generatedCompanyRules[0] as { code?: string; reasons?: string[] }).code, "8136", "最初のcanonical company ruleを維持する");
assert.deepEqual((inputs.generatedCompanyRules[0] as { reasons?: string[] }).reasons, ["first canonical rule"], "後続duplicate ruleでprovenanceを上書きしない");
assert.equal((inputs.generatedCompanyRules[1] as { code?: string }).code, undefined, "code-less legacy ruleは既存互換で維持する");
assert.ok(inputs.warnings.some(warning => warning.includes("alpha-pon-data.json.generatedCompanyRules: duplicate_identity") && warning.includes("dropped 2")));

console.log("world-impact review input: future reflectionとduplicate/padded candidate/company-rule identityを隔離する");
