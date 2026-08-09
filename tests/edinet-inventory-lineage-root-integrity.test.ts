import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { EdinetDoc } from "../src/fetcher/edinet.js";
import { buildConfiguredEdinetInventory } from "../src/fetcher/edinet-configured-pilot.js";
import { buildSanrioEdinetInventory } from "../src/fetcher/edinet-sanrio-pilot.js";
import { buildEdinetIssuerRegistry, resolveEdinetIssuerBoundary } from "../src/research/edinet-issuer-boundary.js";
import { buildEdinetInventoryCompatibilityAudit } from "../src/research/edinet-inventory-compatibility-audit.js";

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

function rehashConfigured(value: JsonObject): void {
  const { inventoryHash: _ignored, ...withoutHash } = value;
  value.inventoryHash = digest(withoutHash);
}

function baseDoc(): EdinetDoc {
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
  };
}

const registry = buildEdinetIssuerRegistry(JSON.parse(
  readFileSync("config/research/edinet-issuer-registry.v1.json", "utf-8"),
) as unknown);
const boundary = resolveEdinetIssuerBoundary(registry, "sanrio");
const common = {
  from: "2026-01-01",
  to: "2026-08-06",
  generatedAt: "2026-08-06T11:00:00.000Z",
  scannedBusinessDays: 156,
  failedDates: [],
  docs: [baseDoc()],
};
const legacy = buildSanrioEdinetInventory(common) as unknown as JsonObject;
const configured = buildConfiguredEdinetInventory({
  ...common,
  boundary,
  registryHash: registry.registryHash,
}) as unknown as JsonObject;

for (const inventory of [legacy, configured]) {
  const lineage = inventory.lineage as JsonObject;
  const nodes = lineage.nodes as JsonObject[];
  nodes[0]!.chainRootDocID = "S100GHOST";
}
rehashConfigured(configured);

assert.throws(
  () => buildEdinetInventoryCompatibilityAudit({
    legacyInventory: legacy,
    configuredInventory: configured,
    legacyInventoryFile: "sanrio-edinet-inventory.legacy.json",
    configuredInventoryFile: "sanrio-edinet-inventory.configured.json",
  }),
  /references missing chain root S100GHOST/,
);

console.log("edinet-inventory-lineage-root-integrity.test.ts passed");
