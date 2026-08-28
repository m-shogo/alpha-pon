import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../../src/research/schema.js";

const relationSchema = JSON.parse(
  readFileSync("research/schemas/research-relation.schema.json", "utf-8"),
) as Record<string, unknown>;

function expectValid(value: unknown, message: string): void {
  assert.deepEqual(validate(value, relationSchema), [], message);
}

expectValid({
  schemaVersion: 1,
  ontologyVersion: "research-knowledge-v1",
  id: "relation-claim-to-research-item",
  relationType: "used_in",
  sourceType: "claim",
  sourceId: "claim:kioxia_rerating:structural_discount",
  targetType: "research_item",
  targetId: "research-kioxia-post-ipo-rerating",
  role: "supporting_sample",
  createdAt: "2026-08-28T10:45:00+09:00",
}, "Research Relation must not impose Research Catalog kebab-case IDs on external Claim/Evidence authorities");

expectValid({
  schemaVersion: 1,
  ontologyVersion: "research-knowledge-v1",
  id: "relation-kioxia-case-entity",
  relationType: "involves_entity",
  sourceType: "case",
  sourceId: "case-kioxia-ipo-rerating",
  targetType: "entity",
  targetId: "issuer:jp:kioxia_holdings",
  createdAt: "2026-08-28T10:45:00+09:00",
}, "Case must reference Security/Entity Master identity without becoming the company identity itself");

expectValid({
  schemaVersion: 1,
  ontologyVersion: "research-knowledge-v1",
  id: "relation-misconduct-case-event-one",
  relationType: "includes_event",
  sourceType: "case",
  sourceId: "case-misconduct-example",
  targetType: "event",
  targetId: "event:incident:example",
  order: 0,
  createdAt: "2026-08-28T10:45:00+09:00",
}, "Case must be able to represent ordered Event Chain references without owning Event truth");

console.log("research knowledge external refs: independent identity contracts preserved");
