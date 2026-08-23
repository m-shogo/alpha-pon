import { todayJst } from "./date.js";
import type { IrEventEvidence } from "./pro-types.js";
import type { HypothesisOutcome } from "./universe.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isCurrentStockProCommitteeGeneratedAt(value: unknown, asOf = todayJst()): value is string {
  return isStrictGregorianDate(value) && value === asOf;
}

export function isStockProCommitteeDecision(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return isCanonicalText(value.code)
    && isCanonicalText(value.name)
    && isCanonicalText(value.finalLabel)
    && typeof value.finalScore === "number"
    && Number.isFinite(value.finalScore)
    && (value.originalFinalLabel === undefined || value.originalFinalLabel === null || isCanonicalText(value.originalFinalLabel));
}

export function parseStockProCommitteeIrEventEvidence(value: unknown): IrEventEvidence[] {
  if (!isRecord(value) || !Array.isArray(value.events)) return [];
  return value.events.filter((event): event is IrEventEvidence => isRecord(event) && isCanonicalText(event.code));
}

export function parseStockProCommitteeCodeSnapshots<T extends { code: string }>(value: unknown): T[] {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) return [];
  return value.snapshots.filter((snapshot): snapshot is T => isRecord(snapshot) && isCanonicalText(snapshot.code));
}

export function parseStockProCommitteeOutcomes(value: unknown): HypothesisOutcome[] {
  if (!isRecord(value) || !Array.isArray(value.outcomes)) return [];
  return value.outcomes.filter((outcome): outcome is HypothesisOutcome => (
    isRecord(outcome)
    && isCanonicalText(outcome.code)
    && (outcome.maxDrawdownPct === null || (typeof outcome.maxDrawdownPct === "number" && Number.isFinite(outcome.maxDrawdownPct)))
  ));
}
