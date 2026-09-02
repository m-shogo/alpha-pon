import assert from "node:assert/strict";
import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEdgeProvenanceRepository } from "../../src/research/edge-provenance.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-edge-provenance-boundary-"));
try {
  const canonicalSchema = "research/schemas/edge-provenance.schema.json";
  const externalProvenance = join(root, "external-provenance.jsonl");
  writeFileSync(externalProvenance, "{}\n", "utf-8");

  const hardLinkedProvenance = join(root, "hard-linked-provenance.jsonl");
  linkSync(externalProvenance, hardLinkedProvenance);
  const hardLinkedResult = readEdgeProvenanceRepository([], {
    path: hardLinkedProvenance,
    schemaPath: canonicalSchema,
  });
  assert.equal(hardLinkedResult.records.length, 0);
  assert.ok(
    hardLinkedResult.issues.some(issue =>
      issue.code === "research_edge_provenance_read_failed"
      && issue.message.includes("standalone regular file")
    ),
    "hard-linked provenance input must fail closed",
  );
  assert.equal(readFileSync(externalProvenance, "utf-8"), "{}\n", "hard-link target must remain untouched");

  const symlinkedProvenance = join(root, "symlinked-provenance.jsonl");
  symlinkSync(externalProvenance, symlinkedProvenance);
  const symlinkedResult = readEdgeProvenanceRepository([], {
    path: symlinkedProvenance,
    schemaPath: canonicalSchema,
  });
  assert.ok(
    symlinkedResult.issues.some(issue =>
      issue.code === "research_edge_provenance_read_failed"
      && issue.message.includes("standalone regular file")
    ),
    "symlinked provenance input must fail closed",
  );

  const standaloneProvenance = join(root, "standalone-provenance.jsonl");
  writeFileSync(standaloneProvenance, "", "utf-8");
  const externalSchema = join(root, "external-schema.json");
  writeFileSync(externalSchema, readFileSync(canonicalSchema, "utf-8"), "utf-8");
  const hardLinkedSchema = join(root, "hard-linked-schema.json");
  linkSync(externalSchema, hardLinkedSchema);
  const hardLinkedSchemaResult = readEdgeProvenanceRepository([], {
    path: standaloneProvenance,
    schemaPath: hardLinkedSchema,
  });
  assert.ok(
    hardLinkedSchemaResult.issues.some(issue =>
      issue.code === "research_edge_provenance_read_failed"
      && issue.message.includes("edge provenance schema must be a standalone regular file")
    ),
    "hard-linked schema input must fail closed",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("edge-provenance-file-boundary.test.ts passed");
