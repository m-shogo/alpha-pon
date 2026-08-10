import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate, type JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/recommendation-record.schema.json", "utf-8"),
) as JsonSchema;
const properties = schema.properties as Record<string, JsonSchema>;
const sourceEvidenceSchema = properties.sourceEvidence!;

for (const ref of [
  "https://example.com/evidence?document=123",
  "https://example.com/evidence#section-2",
]) {
  assert.deepEqual(
    validate([{ tier: "A", ref }], sourceEvidenceSchema),
    [],
    `normal Evidence URL must remain valid: ${ref}`,
  );
}

for (const ref of [
  "https://user:password@example.com/evidence",
  "https://token@example.com/evidence",
  "custom+https://user@example.com/evidence",
  "https://example.com/evidence#token=synthetic-secret",
  "https://example.com/evidence#API_KEY=synthetic-secret",
  "https://example.com/evidence#password=synthetic-secret",
  "https://example.com/evidence#section&Subscription-Key=synthetic-secret",
]) {
  const errors = validate([{ tier: "A", ref }], sourceEvidenceSchema);
  assert.ok(
    errors.length > 0,
    `credential-bearing Evidence URL must fail closed: ${ref}`,
  );
}

console.log("recommendation-evidence-url-userinfo.test.ts passed");
