import assert from "node:assert/strict";
import {
  validateSecurityEntityRecord,
  withSecurityEntityHash,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema("research/schemas/security-master-entity-record.schema.json");

function listedSecurity(value: string) {
  const input: SecurityMasterEntityRecordInput = {
    schemaVersion: 1,
    recordId: "entity:security:canonical:record:001",
    entityId: "entity:security:canonical",
    entityType: "listed_security",
    canonicalName: "Canonical普通株式",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Canonical普通株式",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:canonical"],
    }],
    identifiers: [{
      type: "jpx_code",
      value,
      market: "TSE",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:jpx:canonical"],
    }],
    officialLinks: [{
      kind: "website",
      url: "https://example.com/canonical",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: ["source:web:canonical"],
    }],
    sourceRefs: ["source:entity:canonical"],
    observedAt: "2026-08-09T09:00:00+09:00",
    retrievedAt: "2026-08-09T09:01:00+09:00",
  };
  return withSecurityEntityHash(input);
}

for (const value of [" ", " 1234", "1234 "]) {
  const issues = validateSecurityEntityRecord(listedSecurity(value), schema);
  assert.ok(
    issues.some((issue) => issue.code === "schema_violation" && issue.target.includes("identifiers[0].value")),
    `expected non-canonical identifier value ${JSON.stringify(value)} to fail closed`,
  );
}

assert.deepEqual(
  validateSecurityEntityRecord(listedSecurity("1234"), schema)
    .filter((issue) => issue.severity === "error"),
  [],
);

console.log("security-master-identifier-canonicality.test.ts passed");
