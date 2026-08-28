import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../../src/research/schema.js";

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`research/schemas/${name}`, "utf-8")) as Record<string, unknown>;
}

const ontologyVersion = "research-knowledge-v1";
const at = "2026-08-28T10:00:00+09:00";

function valid(name: string, value: unknown): void {
  const errors = validate(value, loadSchema(name));
  assert.deepEqual(errors, [], `${name} should accept fixture: ${JSON.stringify(errors)}`);
}

function invalid(name: string, value: unknown, path: string): void {
  const errors = validate(value, loadSchema(name));
  assert.ok(errors.some((error) => error.path === path), `${name} should reject ${path}: ${JSON.stringify(errors)}`);
}

valid("research-item.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "research-kioxia-post-ipo-rerating",
  title: "Kioxia post-IPO rerating investigation",
  status: "captured",
  createdAt: at,
  origin: "user",
  summary: "Preserve the idea before causal mechanism, sample count, confidence or formal Edge status is known.",
});
invalid("research-item.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "research-kioxia-post-ipo-rerating",
  title: "Kioxia post-IPO rerating investigation",
  status: "captured",
  createdAt: at,
  origin: "user",
  summary: "Early idea.",
  confidence: 0.8,
}, "confidence");
invalid("research-item.schema.json", {
  schemaVersion: 1,
  ontologyVersion: "research-knowledge-v2",
  id: "research-kioxia-post-ipo-rerating",
  title: "Kioxia post-IPO rerating investigation",
  status: "captured",
  createdAt: at,
  origin: "user",
  summary: "Ontology meaning cannot silently change.",
}, "ontologyVersion");

valid("research-observation.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "observation-kioxia-post-ipo-rise",
  title: "Kioxia shares rerated after IPO",
  observedAt: at,
  origin: "user",
  summary: "Observed market behavior only; causal attribution remains unresolved.",
});
invalid("research-observation.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "observation-kioxia-post-ipo-rise",
  title: "Kioxia shares rerated after IPO",
  observedAt: at,
  origin: "user",
  summary: "Observed market behavior.",
  mechanism: "PE exit caused the move",
}, "mechanism");

valid("research-study.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "study-misconduct-formal-event-repricing",
  title: "Misconduct formal-event repricing exploratory study",
  mode: "exploratory",
  status: "draft",
  createdAt: at,
  purpose: "Test whether formal event dates add information beyond the initial misconduct shock.",
});
invalid("research-study.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "study-misconduct-formal-event-repricing",
  title: "Misconduct formal-event repricing exploratory study",
  mode: "post_hoc_winner",
  status: "draft",
  createdAt: at,
  purpose: "Invalid study mode.",
}, "mode");

valid("research-study-sample-manifest.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "sample-misconduct-formal-event-v1",
  studyId: "study-misconduct-formal-event-repricing",
  role: "exploratory",
  createdAt: at,
  selectionCutoff: at,
  selectionMethod: "Include cases meeting the declared event and issuer criteria at the selection cutoff.",
  includedCaseIds: ["case-revolution-special-attention"],
  excludedCases: [{
    caseId: "case-external-venue-crime",
    reason: "External venue-only incident is outside the internal-misconduct population.",
  }],
});
invalid("research-study-sample-manifest.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "sample-misconduct-formal-event-v1",
  studyId: "study-misconduct-formal-event-repricing",
  role: "exploratory",
  createdAt: at,
  selectionCutoff: at,
  selectionMethod: "Declared selection method.",
  includedCaseIds: [],
  excludedCases: [{ caseId: "case-external-venue-crime" }],
}, "excludedCases[0].reason");

valid("research-relation.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "relation-kioxia-item-case",
  relationType: "used_in",
  sourceType: "case",
  sourceId: "case-kioxia-ipo-rerating",
  targetType: "research_item",
  targetId: "research-kioxia-post-ipo-rerating",
  role: "seed",
  createdAt: at,
});
invalid("research-relation.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "relation-bad-inverse",
  relationType: "parent_of",
  sourceType: "research_item",
  sourceId: "research-kioxia-post-ipo-rerating",
  targetType: "case",
  targetId: "case-kioxia-ipo-rerating",
  createdAt: at,
}, "relationType");
invalid("research-relation.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "relation-generic",
  relationType: "related_to",
  sourceType: "research_item",
  sourceId: "research-kioxia-post-ipo-rerating",
  targetType: "case",
  targetId: "case-kioxia-ipo-rerating",
  createdAt: at,
}, "relationType");

valid("research-lineage.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "lineage-known-bad-into-misconduct",
  lineageType: "merged_into",
  sourceType: "edge",
  sourceId: "known-bad-event-repricing",
  targetType: "edge",
  targetId: "misconduct-overreaction-recovery",
  decidedAt: at,
  reason: "The causal signature is shared and the former Edge is better represented as a formal-event repricing phase.",
});
invalid("research-lineage.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "lineage-bad-merged-status",
  lineageType: "merged",
  sourceType: "edge",
  sourceId: "known-bad-event-repricing",
  targetType: "edge",
  targetId: "misconduct-overreaction-recovery",
  decidedAt: at,
  reason: "Merged is a semantic lineage action, not a maturity status.",
}, "lineageType");

console.log("research knowledge schema core: all tests passed");
