import assert from "node:assert/strict";
import {
  buildSecurityMasterSnapshot,
  resolveEntityByIdentifier,
  withSecurityEntityHash,
  type SecurityIdentifier,
  type SecurityMasterEntityRecord,
} from "../../src/research/security-master.js";

function security(
  entityId: string,
  identifiers: SecurityIdentifier[],
): SecurityMasterEntityRecord {
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${entityId}:record:001`,
    entityId,
    entityType: "listed_security",
    canonicalName: entityId,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: entityId,
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: [`source:name:${entityId}`],
    }],
    identifiers,
    officialLinks: [{
      kind: "website",
      url: "https://example.com/",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: [`source:web:${entityId}`],
    }],
    sourceRefs: [`source:entity:${entityId}`],
    observedAt: "2026-08-05T15:00:00+09:00",
    retrievedAt: "2026-08-05T15:01:00+09:00",
  });
}

const tickerSecurity = security("entity:security:ticker", [{
  type: "ticker",
  value: "ALP",
  market: "TSE",
  validFrom: "2020-01-01",
  confidence: "verified",
  sourceRefs: ["source:ticker:alp"],
}]);
const providerSecurity = security("entity:security:provider", [{
  type: "provider_code",
  value: "ALPHA-1",
  provider: "example-provider",
  validFrom: "2020-01-01",
  confidence: "verified",
  sourceRefs: ["source:provider:alpha-1"],
}]);
const jpxSecurity = security("entity:security:jpx", [{
  type: "jpx_code",
  value: "1234",
  market: "TSE",
  validFrom: "2020-01-01",
  confidence: "verified",
  sourceRefs: ["source:jpx:1234"],
}]);
const isinSecurity = security("entity:security:isin", [{
  type: "isin",
  value: "JP0000000001",
  validFrom: "2020-01-01",
  confidence: "verified",
  sourceRefs: ["source:isin:jp0000000001"],
}]);
const snapshot = buildSecurityMasterSnapshot(
  [tickerSecurity, providerSecurity, jpxSecurity, isinSecurity],
  [],
  "2026-08-05",
);

assert.throws(
  () => resolveEntityByIdentifier(snapshot, { type: "ticker", value: "ALP" }),
  /security_master_market_required:ticker:ALP/,
);
assert.throws(
  () => resolveEntityByIdentifier(snapshot, { type: "ticker", value: "ALP", market: "   " }),
  /security_master_market_required:ticker:ALP/,
);
assert.equal(
  resolveEntityByIdentifier(snapshot, { type: "ticker", value: "alp", market: " tse " }).entityId,
  tickerSecurity.entityId,
);

assert.throws(
  () => resolveEntityByIdentifier(snapshot, { type: "provider_code", value: "ALPHA-1" }),
  /security_master_provider_required:provider_code:ALPHA-1/,
);
assert.throws(
  () => resolveEntityByIdentifier(snapshot, {
    type: "provider_code",
    value: "ALPHA-1",
    provider: "   ",
  }),
  /security_master_provider_required:provider_code:ALPHA-1/,
);
assert.equal(
  resolveEntityByIdentifier(snapshot, {
    type: "provider_code",
    value: "alpha-1",
    provider: " EXAMPLE-PROVIDER ",
  }).entityId,
  providerSecurity.entityId,
);

assert.equal(
  resolveEntityByIdentifier(snapshot, { type: "jpx_code", value: "1234" }).entityId,
  jpxSecurity.entityId,
);
assert.equal(
  resolveEntityByIdentifier(snapshot, { type: "isin", value: "jp0000000001" }).entityId,
  isinSecurity.entityId,
);

console.log("security-master-resolver-namespace.test.ts passed");
