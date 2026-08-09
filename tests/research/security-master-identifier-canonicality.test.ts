import assert from "node:assert/strict";
import {
  validateSecurityEntityRecord,
  withSecurityEntityHash,
  type SecurityIdentifier,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schema = loadCouncilSchema("research/schemas/security-master-entity-record.schema.json");

function listedSecurity(identifier: SecurityIdentifier) {
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
    identifiers: [identifier],
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

function jpxCode(value: string, market = "TSE"): SecurityIdentifier {
  return {
    type: "jpx_code",
    value,
    market,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:jpx:canonical"],
  };
}

for (const value of [" ", " 1234", "1234 "]) {
  const issues = validateSecurityEntityRecord(listedSecurity(jpxCode(value)), schema);
  assert.ok(
    issues.some((issue) => issue.code === "schema_violation" && issue.target.includes("identifiers[0].value")),
    `expected non-canonical identifier value ${JSON.stringify(value)} to fail closed`,
  );
}

for (const market of [" TSE", "TSE "]) {
  const issues = validateSecurityEntityRecord(listedSecurity(jpxCode("1234", market)), schema);
  assert.ok(
    issues.some((issue) => issue.code === "schema_violation" && issue.target.includes("identifiers[0].market")),
    `expected non-canonical market namespace ${JSON.stringify(market)} to fail closed`,
  );
}

for (const provider of [" example-provider", "example-provider "]) {
  const issues = validateSecurityEntityRecord(listedSecurity({
    type: "provider_code",
    value: "ALPHA-1",
    provider,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:provider:canonical"],
  }), schema);
  assert.ok(
    issues.some((issue) => issue.code === "schema_violation" && issue.target.includes("identifiers[0].provider")),
    `expected non-canonical provider namespace ${JSON.stringify(provider)} to fail closed`,
  );
}

assert.deepEqual(
  validateSecurityEntityRecord(listedSecurity(jpxCode("1234")), schema)
    .filter((issue) => issue.severity === "error"),
  [],
);

console.log("security-master-identifier-canonicality.test.ts passed");
