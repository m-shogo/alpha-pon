import assert from "node:assert/strict";
import { loadResearchKnowledgeRepositorySnapshot } from "../../src/research/research-knowledge-repository-loader.js";

const result = loadResearchKnowledgeRepositorySnapshot();
assert.deepEqual(result.issues, [], "canonical intake seeds must preserve a valid Research Knowledge snapshot");

const kioxiaItem = result.snapshot.researchItems.find((entry) => entry.id === "kioxia-post-ipo-rerating");
assert.ok(kioxiaItem, "Kioxia idea must be preserved as a ResearchItem instead of being lost in watch config");
assert.equal(kioxiaItem.origin, "migration");

const kioxiaQuestion = result.snapshot.researchQuestions.find((entry) => entry.id === "kioxia-rerating-causal-decomposition");
assert.ok(kioxiaQuestion, "Kioxia causal ambiguity must be represented as an explicit ResearchQuestion");
assert.ok(result.snapshot.relations.some((relation) =>
  relation.relationType === "addresses"
  && relation.sourceId === kioxiaQuestion.id
  && relation.targetType === "research_item"
  && relation.targetId === kioxiaItem.id,
));

const kioxiaCase = result.snapshot.cases.find((entry) => entry.id === "kioxia-285a-post-ipo-rerating-case");
assert.ok(kioxiaCase, "Kioxia episode must be preserved independently from issuer identity");
assert.ok(result.snapshot.relations.some((relation) =>
  relation.relationType === "used_in"
  && relation.sourceId === kioxiaCase.id
  && relation.targetId === kioxiaItem.id
  && relation.role === "candidate",
), "Kioxia must enter the graph as a candidate case, not as a pre-labelled successful sample");

const sanctionItem = result.snapshot.researchItems.find((entry) => entry.id === "exchange-sanction-ladder");
assert.ok(sanctionItem, "Exchange Sanction Ladder shadow research must be preserved as a ResearchItem");
assert.equal(sanctionItem.origin, "migration");

const sanctionQuestion = result.snapshot.researchQuestions.find((entry) => entry.id === "exchange-sanction-ladder-repeatability");
assert.ok(sanctionQuestion);
assert.ok(result.snapshot.relations.some((relation) =>
  relation.relationType === "addresses"
  && relation.sourceId === sanctionQuestion.id
  && relation.targetId === sanctionItem.id,
));

const revolutionCase = result.snapshot.cases.find((entry) => entry.id === "revolution-8894-special-attention-2026-07");
assert.ok(revolutionCase, "REVOLUTION case note must have a stable Case identity");
assert.ok(result.snapshot.relations.some((relation) =>
  relation.relationType === "used_in"
  && relation.sourceId === revolutionCase.id
  && relation.targetId === sanctionItem.id
  && relation.role === "candidate",
), "REVOLUTION must remain a candidate analog until the unresolved PIT/execution controls are completed");

console.log("research knowledge intake seeds: all tests passed");
