import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate } from "../../src/research/schema.js";

const relationSchema = JSON.parse(
  readFileSync("research/schemas/research-relation.schema.json", "utf-8"),
) as Record<string, unknown>;

const errors = validate({
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
}, relationSchema);

assert.deepEqual(
  errors,
  [],
  "Research Relation must not impose Research Catalog kebab-case IDs on external Claim/Evidence authorities",
);

console.log("research knowledge external refs: independent identity contracts preserved");
