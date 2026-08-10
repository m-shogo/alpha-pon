import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, type JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/recommendation-record.schema.json", "utf-8"),
) as JsonSchema;
const properties = schema.properties as Record<string, JsonSchema>;
const sourceEvidenceSchema = properties.sourceEvidence!;

assert.deepEqual(
  validate(
    [{ tier: "A", ref: "https://example.com/evidence?document=123" }],
    sourceEvidenceSchema,
  ),
  [],
  "normal Evidence URLs must remain valid",
);

for (const ref of [
  "https://user:password@example.com/evidence",
  "https://token@example.com/evidence",
  "custom+https://user@example.com/evidence",
]) {
  const errors = validate([{ tier: "A", ref }], sourceEvidenceSchema);
  assert.ok(
    errors.some((error) => error.path === "[0].ref" && error.message.includes("pattern")),
    `credential-bearing URL userinfo must fail closed: ${ref}`,
  );
}

console.log("recommendation-evidence-url-userinfo.test.ts passed");
