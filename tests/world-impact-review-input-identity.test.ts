import assert from "node:assert/strict";
import { normalizeWorldImpactReviewInputs } from "../src/world-impact-review-input.js";

const reflection = (eventId: string) => ({
  schemaVersion: 1,
  createdAt: "2026-08-26",
  eventId,
  title: "World event",
  urgencyScore: 80,
  categories: ["macro"],
  impactedTags: ["risk"],
  thesis: "review",
  chainOfImpact: ["event -> company"],
  possibleBeneficiaries: ["company"],
  possibleRisks: ["risk"],
  evidenceNeeded: ["official source"],
  invalidationSignals: ["reversal"],
});

const normalized = normalizeWorldImpactReviewInputs(
  [reflection("evt-1"), reflection("evt-1"), reflection(" evt-2 ")],
  { candidates: [], universeCandidates: [], generatedCompanyRules: [] },
  "2026-08-26",
);

assert.deepEqual(
  normalized.reflections.map((row: any) => row.eventId),
  ["evt-1"],
  "duplicate or padded world-event identities must not create duplicate review evidence",
);
assert.ok(
  normalized.warnings.some(warning => warning.includes("invalid_rows") && warning.includes("dropped 1")),
  "padded reflection identity must be isolated as malformed provenance",
);
assert.ok(
  normalized.warnings.some(warning => warning.includes("duplicate_identity") && warning.includes("dropped 1")),
  "duplicate reflection identity must be surfaced as provenance warning",
);

console.log("world-impact review input identity tests passed");
