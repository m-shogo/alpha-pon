import { normalizeCompanyHypothesesRoot, normalizeCompanyNetworkRoot } from "./company-coverage-input.js";
import { normalizeCompanyHypothesisReportRows } from "./company-hypothesis-report-input.js";
import { normalizeCompanyNetworkReportRows } from "./company-coverage-input.js";
import { normalizeProIrEventInput } from "./pro-ir-event-input.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value ? value : null;
}

export type StockProQualityGate = {
  id: string;
  label: string;
  severity: "critical" | "high" | "medium";
  failAction: string;
  proQuestion: string;
};

function normalizeGates(raw: unknown): { gates: StockProQualityGate[]; warnings: string[] } {
  if (!isRecord(raw)) {
    return { gates: [], warnings: ["stock-pro-quality-gate.yml root shape is invalid"] };
  }
  if (raw.qualityGates === undefined) return { gates: [], warnings: [] };
  if (!Array.isArray(raw.qualityGates)) {
    return { gates: [], warnings: ["stock-pro-quality-gate.yml qualityGates shape is invalid"] };
  }

  const gates: StockProQualityGate[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  raw.qualityGates.forEach((rawGate, index) => {
    if (!isRecord(rawGate)) {
      warnings.push(`stock-pro-quality-gate.yml gate row ${index + 1} shape is invalid`);
      return;
    }
    const id = canonicalString(rawGate.id);
    const label = canonicalString(rawGate.label);
    const failAction = canonicalString(rawGate.failAction);
    const proQuestion = canonicalString(rawGate.proQuestion);
    const severity = rawGate.severity;
    if (!id || !label || !failAction || !proQuestion || !["critical", "high", "medium"].includes(String(severity))) {
      warnings.push(`stock-pro-quality-gate.yml gate row ${index + 1} fields are invalid`);
      return;
    }
    if (seenIds.has(id)) {
      warnings.push(`stock-pro-quality-gate.yml gate ${id} canonical identity is duplicated`);
      return;
    }
    seenIds.add(id);
    gates.push({ id, label, failAction, proQuestion, severity: severity as StockProQualityGate["severity"] });
  });
  return { gates, warnings };
}

export function normalizeStockProQualityInputs(
  hypothesesRaw: unknown,
  networkRaw: unknown,
  irEventsRaw: unknown,
  gateConfigRaw: unknown,
  asOf: string,
) {
  const hypotheses = normalizeCompanyHypothesisReportRows(normalizeCompanyHypothesesRoot(hypothesesRaw), asOf);
  const network = normalizeCompanyNetworkReportRows(normalizeCompanyNetworkRoot(networkRaw));
  const irEvents = normalizeProIrEventInput(irEventsRaw);
  const gateState = normalizeGates(gateConfigRaw);
  const warnings = [
    ...hypotheses.warnings,
    ...network.warnings,
    ...gateState.warnings,
  ];
  if (irEvents.invalidRoot || irEvents.invalidCompanyCount > 0 || irEvents.invalidEventCount > 0) {
    warnings.push(`company-ir-events.yml input is invalid: root=${irEvents.invalidRoot ? 1 : 0}, companies=${irEvents.invalidCompanyCount}, events=${irEvents.invalidEventCount}`);
  }

  return {
    categories: hypotheses.categories,
    networkCompanies: network.companies,
    irCompanies: irEvents.companies,
    gates: gateState.gates,
    warnings,
  };
}
