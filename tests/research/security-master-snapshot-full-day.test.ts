import assert from "node:assert/strict";
import {
  buildSecurityMasterSnapshot,
  withSecurityEntityHash,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";

function entity(
  overrides: Partial<SecurityMasterEntityRecordInput> = {},
) {
  const entityId = overrides.entityId ?? "entity:issuer:alpha";
  const canonicalName = overrides.canonicalName ?? "Alpha株式会社";
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${entityId}:record:001`,
    entityId,
    entityType: "legal_entity",
    canonicalName,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: canonicalName,
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: [`source:name:${entityId}`],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${entityId}`],
    }],
    officialLinks: [],
    sourceRefs: [`source:entity:${entityId}`],
    observedAt: overrides.observedAt ?? "2026-08-05T23:59:59.999999998+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T23:59:59.999999999+09:00",
  });
}

const endOfDayEntity = entity({
  recordId: "entity:issuer:alpha:record:end-of-day-cutoff",
});
const nextDayEntity = entity({
  recordId: "entity:issuer:beta:record:next-day-cutoff",
  entityId: "entity:issuer:beta",
  canonicalName: "Beta株式会社",
  observedAt: "2026-08-06T00:00:00.000000000+09:00",
  retrievedAt: "2026-08-06T00:00:00.000000000+09:00",
});

const snapshot = buildSecurityMasterSnapshot(
  [endOfDayEntity, nextDayEntity],
  [],
  "2026-08-05",
);

assert.deepEqual(snapshot.entities.map((record) => record.recordId), [
  endOfDayEntity.recordId,
]);

console.log("security-master-snapshot-full-day: fractional end-of-day cutoff preserved OK");
