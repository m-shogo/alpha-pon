import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../../src/research/schema.js";

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`research/schemas/${name}`, "utf-8")) as Record<string, unknown>;
}

const ontologyVersion = "research-knowledge-v1";
const at = "2026-08-28T10:30:00+09:00";

function valid(name: string, value: unknown): void {
  assert.deepEqual(validate(value, loadSchema(name)), [], `${name} fixture should be valid`);
}

function invalid(name: string, value: unknown, path: string): void {
  const errors = validate(value, loadSchema(name));
  assert.ok(errors.some((error) => error.path === path), `${name} should reject ${path}: ${JSON.stringify(errors)}`);
}

valid("research-question.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "question-kioxia-rerating-cause",
  question: "Which mechanisms explain the post-IPO rerating and which competing explanations remain?",
  status: "open",
  createdAt: at,
});

valid("research-mechanism.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "mechanism-structural-discount-removal",
  title: "Structural discount removal",
  description: "A corporate structure change can remove a persistent valuation discount before all earnings effects are visible.",
  status: "active",
  createdAt: at,
});
invalid("research-mechanism.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "mechanism-ai",
  title: "AI",
  description: "Theme masquerading as a mechanism.",
  status: "idea",
  createdAt: at,
}, "status");

valid("research-family.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "family-corporate-structure-rerating",
  title: "Corporate structure rerating",
  description: "A causal research family organized around structural discount and ownership changes rather than sector/theme labels.",
  status: "active",
  createdAt: at,
});

valid("research-component.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "component-formal-event-repricing",
  title: "Formal event repricing phase",
  kind: "phase",
  status: "active",
  createdAt: at,
  description: "A phase inside the broader misconduct/remediation repricing research rather than a separate formal Edge.",
});
invalid("research-component.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "component-formal-event-repricing",
  title: "Formal event repricing phase",
  kind: "edge",
  status: "active",
  createdAt: at,
  description: "Invalid component kind.",
}, "kind");

valid("research-case.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "case-kioxia-ipo-rerating",
  title: "Kioxia IPO and post-IPO rerating episode",
  status: "open",
  createdAt: at,
  summary: "A bounded market episode; issuer/security identity is resolved in the entity domain rather than embedded as the Case identity.",
});
invalid("research-case.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "case-kioxia-ipo-rerating",
  title: "Kioxia IPO and post-IPO rerating episode",
  status: "open",
  createdAt: at,
  summary: "A bounded episode.",
  companyCode: "285A",
}, "companyCode");

valid("research-study-result.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "result-misconduct-formal-event-v1",
  studyId: "study-misconduct-formal-event-repricing",
  sampleManifestId: "sample-misconduct-formal-event-v1",
  createdAt: at,
  effectSummary: "Exploratory observations exist, but concurrent disclosures prevent strong causal attribution.",
  identificationQuality: "correlational",
  exploitability: "observed_effect_only",
  limitations: ["Small sample", "Concurrent disclosures"],
  negativeFindings: ["confounded"],
});
invalid("research-study-result.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "result-misconduct-formal-event-v1",
  studyId: "study-misconduct-formal-event-repricing",
  sampleManifestId: "sample-misconduct-formal-event-v1",
  createdAt: at,
  effectSummary: "Result.",
  identificationQuality: "proven_causal",
  exploitability: "executable_edge",
  limitations: [],
}, "identificationQuality");

valid("research-opportunity.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "opportunity-example-live-instance",
  title: "Example live Edge applicability candidate",
  status: "screening",
  detectedAt: at,
  summary: "A live applicability candidate that has not yet become a Recommendation.",
});
invalid("research-opportunity.schema.json", {
  schemaVersion: 1,
  ontologyVersion,
  id: "opportunity-example-live-instance",
  title: "Example live Edge applicability candidate",
  status: "BUY",
  detectedAt: at,
  summary: "Opportunity cannot encode a Recommendation decision.",
}, "status");

console.log("research knowledge entity schemas: all tests passed");
