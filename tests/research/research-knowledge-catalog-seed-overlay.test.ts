import assert from "node:assert/strict";
import { loadResearchKnowledgeRepositorySnapshot } from "../../src/research/research-knowledge-repository-loader.js";

const result = loadResearchKnowledgeRepositorySnapshot();
assert.deepEqual(result.issues, [], "canonical Research Knowledge seed overlay must form a valid PIT-safe snapshot");

const family = result.snapshot.researchFamilies.find((entry) => entry.id === "misconduct-and-remediation-repricing");
assert.ok(family, "misconduct causal family must be present");
assert.equal(family.status, "active");

const expectedComponents = [
  "misconduct-phase-initial-shock",
  "misconduct-phase-damage-assessment",
  "misconduct-phase-formal-event-repricing",
  "misconduct-phase-remediation",
  "misconduct-phase-recovery",
];
assert.deepEqual(
  result.snapshot.researchComponents
    .filter((entry) => entry.id.startsWith("misconduct-phase-"))
    .map((entry) => entry.id)
    .sort(),
  [...expectedComponents].sort(),
  "the five phases already defined by the formal Edge must be identity-bearing ResearchComponents",
);

for (const componentId of expectedComponents) {
  const parents = result.snapshot.relations.filter((relation) =>
    relation.relationType === "part_of"
    && relation.sourceType === "research_component"
    && relation.sourceId === componentId,
  );
  assert.equal(parents.length, 1, `${componentId} must have exactly one canonical parent relation`);
  assert.equal(parents[0]?.targetType, "edge");
  assert.equal(parents[0]?.targetId, "misconduct-overreaction-recovery");
}

const familyRelations = result.snapshot.relations.filter((relation) =>
  relation.relationType === "member_of"
  && relation.sourceType === "edge"
  && relation.sourceId === "misconduct-overreaction-recovery",
);
assert.equal(familyRelations.length, 1, "formal misconduct Edge must have one primary family relation in this overlay");
assert.equal(familyRelations[0]?.targetId, "misconduct-and-remediation-repricing");
assert.equal(familyRelations[0]?.role, "primary");

const lineage = result.snapshot.lineages.find((entry) => entry.id === "known-bad-merged-into-misconduct");
assert.ok(lineage, "Known-Bad consolidation must be preserved as lineage instead of disappearing");
assert.equal(lineage.lineageType, "merged_into");
assert.equal(lineage.sourceId, "known-bad-event-repricing");
assert.equal(lineage.targetId, "misconduct-overreaction-recovery");
assert.equal(lineage.decidedAt, "2026-08-27T09:23:28Z");

console.log("research knowledge catalog seed overlay: all tests passed");
