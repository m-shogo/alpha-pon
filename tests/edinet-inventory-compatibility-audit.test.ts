import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import { buildConfiguredEdinetInventory } from "../src/fetcher/edinet-configured-pilot.js";
import { buildSanrioEdinetInventory } from "../src/fetcher/edinet-sanrio-pilot.js";
import {
  buildEdinetIssuerRegistry,
  resolveEdinetIssuerBoundary,
} from "../src/research/edinet-issuer-boundary.js";
import {
  buildEdinetInventoryCompatibilityAudit,
  renderEdinetInventoryCompatibilityAudit,
} from "../src/research/edinet-inventory-compatibility-audit.js";

type JsonObject = Record<string, unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function registry() {
  return buildEdinetIssuerRegistry(JSON.parse(
    readFileSync("config/research/edinet-issuer-registry.v1.json", "utf-8"),
  ) as unknown);
}

function doc(overrides: Partial<EdinetDoc> = {}): EdinetDoc {
  return {
    seqNumber: 1,
    docID: "S100ROOT",
    edinetCode: "E02655",
    secCode: "81360",
    JCN: "6010701005104",
    filerName: "株式会社サンリオ",
    fundCode: "",
    ordinanceCode: "010",
    formCode: "030000",
    docTypeCode: "120",
    periodStart: "2025-04-01",
    periodEnd: "2026-03-31",
    submitDateTime: "2026-06-20T15:00:00+09:00",
    docDescription: "有価証券報告書",
    issuerEdinetCode: "",
    subjectEdinetCode: "",
    subsidiaryEdinetCode: "",
    currentReportReason: "",
    parentDocID: "",
    opeDateTime: "2026-06-20T15:00:00+09:00",
    withdrawalStatus: "0",
    docInfoEditStatus: "0",
    disclosureStatus: "0",
    xbrlFlag: "1",
    pdfFlag: "1",
    attachDocFlag: "1",
    englishDocFlag: "0",
    csvFlag: "1",
    legalStatus: "1",
    ...overrides,
  };
}

function inventories() {
  const registryValue = registry();
  const boundary = resolveEdinetIssuerBoundary(registryValue, "sanrio");
  const initial = doc();
  const correction = doc({
    seqNumber: 2,
    docID: "S100CORR",
    parentDocID: initial.docID,
    formCode: "030001",
    submitDateTime: "2026-07-01T15:00:00+09:00",
    opeDateTime: "2026-07-01T15:00:00+09:00",
    docDescription: "訂正有価証券報告書",
  });
  const common = {
    from: "2026-01-01",
    to: "2026-08-06",
    generatedAt: "2026-08-06T11:00:00.000Z",
    scannedBusinessDays: 156,
    failedDates: [],
    docs: [initial, correction],
  };
  return {
    legacy: buildSanrioEdinetInventory(common),
    configured: buildConfiguredEdinetInventory({
      ...common,
      boundary,
      registryHash: registryValue.registryHash,
    }),
  };
}

function rehashConfigured(value: JsonObject): void {
  const { inventoryHash: _ignored, ...withoutHash } = value;
  value.inventoryHash = digest(withoutHash);
}

{
  const { legacy, configured } = inventories();
  const audit = buildEdinetInventoryCompatibilityAudit({
    legacyInventory: legacy,
    configuredInventory: configured,
    legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
    configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
    generatedAt: "2026-08-06T12:00:00.000Z",
  });
  assert.equal(audit.rangeMatch, true);
  assert.equal(audit.completenessMatch, true);
  assert.equal(audit.legacyCandidateCount, 2);
  assert.equal(audit.configuredCandidateCount, 2);
  assert.equal(audit.matchedCandidateCount, 2);
  assert.equal(audit.mismatchCandidateCount, 0);
  assert.equal(audit.equivalentCoreCandidateSet, true);
  assert.equal(audit.migrationReadyForHumanReview, true);
  assert.equal(audit.replacementAuthorized, false);
  assert.equal(audit.appendAuthorized, false);
  assert.ok(audit.comparisons.every(item =>
    item.status === "matched"
    && item.commonCoreDocumentTypes.join(",") === "1,2"
    && item.legacyAdditionalNonCoreTypes.join(",") === "3,5"
    && item.configuredUnexpectedTypes.length === 0,
  ));
  const markdown = renderEdinetInventoryCompatibilityAudit(audit);
  assert.match(markdown, /permits human migration review only/);
  assert.match(audit.auditHash, /^[a-f0-9]{64}$/);
  console.log("edinet-inventory-compatibility: core candidate parity with narrower allowlist OK");
}

{
  const { legacy, configured } = inventories();
  const changed = structuredClone(configured) as unknown as JsonObject;
  const candidates = changed.candidates as JsonObject[];
  candidates.pop();
  const lineage = changed.lineage as JsonObject;
  lineage.nodes = (lineage.nodes as JsonObject[]).filter(node => node.docID !== "S100CORR");
  rehashConfigured(changed);
  const audit = buildEdinetInventoryCompatibilityAudit({
    legacyInventory: legacy,
    configuredInventory: changed,
    legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
    configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
  });
  assert.equal(audit.equivalentCoreCandidateSet, false);
  assert.equal(audit.legacyOnlyCandidateCount, 1);
  assert.ok(audit.blockers.includes("legacy_only_candidates_exist"));
  console.log("edinet-inventory-compatibility: missing configured candidate blocks migration OK");
}

{
  const { legacy, configured } = inventories();
  const changed = structuredClone(configured) as unknown as JsonObject;
  const first = (changed.candidates as JsonObject[])[0]!;
  first.reviewReasons = ["unexpected_reason"];
  rehashConfigured(changed);
  const audit = buildEdinetInventoryCompatibilityAudit({
    legacyInventory: legacy,
    configuredInventory: changed,
    legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
    configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
  });
  assert.equal(audit.mismatchCandidateCount, 1);
  assert.equal(audit.equivalentCoreCandidateSet, false);
  assert.ok(audit.comparisons.some(item => item.differences.includes("review_reasons_differ")));
  console.log("edinet-inventory-compatibility: review reason difference blocks migration OK");
}

{
  const { legacy, configured } = inventories();
  const tampered = structuredClone(configured) as unknown as JsonObject;
  const first = (tampered.candidates as JsonObject[])[0]!;
  const docValue = first.doc as JsonObject;
  docValue.docDescription = "tampered";
  assert.throws(
    () => buildEdinetInventoryCompatibilityAudit({
      legacyInventory: legacy,
      configuredInventory: tampered,
      legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
      configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
    }),
    /configuredInventory.inventoryHash mismatch/,
  );
  console.log("edinet-inventory-compatibility: configured inventory tampering blocked OK");
}

{
  const { legacy, configured } = inventories();
  const changed = structuredClone(configured) as unknown as JsonObject;
  changed.range = { from: "2026-02-01", to: "2026-08-06" };
  rehashConfigured(changed);
  const audit = buildEdinetInventoryCompatibilityAudit({
    legacyInventory: legacy,
    configuredInventory: changed,
    legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
    configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
  });
  assert.equal(audit.rangeMatch, false);
  assert.equal(audit.migrationReadyForHumanReview, false);
  assert.ok(audit.blockers.includes("inventory_ranges_differ"));
  console.log("edinet-inventory-compatibility: range mismatch blocks migration OK");
}

{
  const { legacy, configured } = inventories();
  assert.throws(
    () => buildEdinetInventoryCompatibilityAudit({
      legacyInventory: legacy,
      configuredInventory: configured,
      legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
      configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
      generatedAt: "2026-08-06T12:00:00",
    }),
    /generatedAt must be an explicit-timezone ISO instant/,
  );
  console.log("edinet-inventory-compatibility: timezone-less generatedAt fails closed OK");
}

{
  const { legacy, configured } = inventories();
  const badLegacy = structuredClone(legacy) as unknown as JsonObject;
  const badConfigured = structuredClone(configured) as unknown as JsonObject;
  badLegacy.range = { from: "2026-02-31", to: "2026-08-06" };
  badConfigured.range = { from: "2026-02-31", to: "2026-08-06" };
  rehashConfigured(badConfigured);
  assert.throws(
    () => buildEdinetInventoryCompatibilityAudit({
      legacyInventory: badLegacy,
      configuredInventory: badConfigured,
      legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
      configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
    }),
    /legacyInventory\.range\.from must be a real Gregorian date/,
  );
  console.log("edinet-inventory-compatibility: matching impossible ranges cannot become migration-ready OK");
}

{
  const { legacy, configured } = inventories();
  const badLegacy = structuredClone(legacy) as unknown as JsonObject;
  const badConfigured = structuredClone(configured) as unknown as JsonObject;
  const legacyFirst = (badLegacy.candidates as JsonObject[])[0]!;
  const configuredFirst = (badConfigured.candidates as JsonObject[])[0]!;
  (legacyFirst.doc as JsonObject).submitDateTime = "2026-06-20T15:00:00";
  (configuredFirst.doc as JsonObject).submitDateTime = "2026-06-20T15:00:00";
  rehashConfigured(badConfigured);
  assert.throws(
    () => buildEdinetInventoryCompatibilityAudit({
      legacyInventory: badLegacy,
      configuredInventory: badConfigured,
      legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
      configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
    }),
    /submitDateTime must be an explicit-timezone ISO instant/,
  );
  console.log("edinet-inventory-compatibility: matching timezone-less candidate timestamps cannot become migration-ready OK");
}

console.log("edinet-inventory-compatibility-audit.test.ts passed");
