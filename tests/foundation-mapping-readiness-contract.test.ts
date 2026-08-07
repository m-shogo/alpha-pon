import assert from "node:assert/strict";
import {
  FOUNDATION_INPUT_PRIOR_CONTRACT_EXHAUSTIVE,
  FOUNDATION_INPUT_PRIOR_KEYS,
  FOUNDATION_INPUT_ROOT_CONTRACT_EXHAUSTIVE,
  FOUNDATION_INPUT_SECTION_CONTRACT_EXHAUSTIVE,
  FOUNDATION_INPUT_SECTION_KEYS,
  FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS,
  foundationMappingRemediationDefinition,
  foundationMappingRequiredFieldPaths,
} from "../src/research/foundation-mapping-readiness-contract.js";

assert.equal(FOUNDATION_INPUT_ROOT_CONTRACT_EXHAUSTIVE, true);
assert.equal(FOUNDATION_INPUT_SECTION_CONTRACT_EXHAUSTIVE, true);
assert.equal(FOUNDATION_INPUT_PRIOR_CONTRACT_EXHAUSTIVE, true);

const groupIds = FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS.map(definition => definition.groupId);
assert.equal(new Set(groupIds).size, groupIds.length, "remediation group IDs must be unique");

const orders = FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS.map(definition => definition.order);
assert.equal(new Set(orders).size, orders.length, "remediation group order must be unique");
assert.deepEqual([...orders].sort((left, right) => left - right), orders, "remediation definitions must be ordered");

const byId = new Map(FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS.map(definition => [definition.groupId, definition]));
for (const definition of FOUNDATION_MAPPING_REMEDIATION_DEFINITIONS) {
  assert.equal(foundationMappingRemediationDefinition(definition.groupId), definition);
  assert.ok(definition.action.length > 0, `${definition.groupId} action is required`);
  assert.ok(definition.rootKeys.length > 0, `${definition.groupId} root keys are required`);
  assert.ok(definition.fieldPaths.length > 0, `${definition.groupId} field paths are required`);
  assert.equal(new Set(definition.fieldPaths).size, definition.fieldPaths.length, `${definition.groupId} field paths must be unique`);
  for (const dependencyId of definition.dependsOnGroupIds) {
    const dependency = byId.get(dependencyId);
    assert.ok(dependency, `${definition.groupId} dependency ${dependencyId} must exist`);
    assert.ok(dependency.order < definition.order, `${definition.groupId} dependency must run earlier`);
  }
}

assert.equal(foundationMappingRemediationDefinition("future_unknown_group"), null);
assert.deepEqual(FOUNDATION_INPUT_SECTION_KEYS, ["sectionId", "path", "ordinal", "titleHash", "contentHash"]);
assert.deepEqual(FOUNDATION_INPUT_PRIOR_KEYS, [
  "evidenceId",
  "documentRevisionId",
  "documentRevisionRecordId",
  "relationType",
  "supersessionStrength",
]);

const requiredPaths = foundationMappingRequiredFieldPaths();
for (const required of [
  "entityIds",
  "sourceContentHash",
  "publishedAt",
  "firstExecutableAt",
  "parserVersion",
  "normalizedStructureHash",
  "revisionKind",
  "license",
  "storagePolicy",
  "sections[].sectionId",
  "sections[].titleHash",
  "sections[].contentHash",
]) {
  assert.ok(requiredPaths.includes(required), `missing canonical Foundation field path ${required}`);
}

console.log("foundation-mapping-readiness-contract.test.ts passed");
