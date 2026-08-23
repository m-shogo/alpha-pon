import { todayJst } from "./date.js";
import type { IrEventEvidence } from "./pro-types.js";
import type { HypothesisOutcome } from "./universe.js";

const QUALITY_LABELS = new Set(["compounder", "good_business", "cyclical_quality", "fragile", "unknown"]);
const GROWTH_ADJUSTED_VALUATIONS = new Set(["reasonable", "expensive_but_growth", "too_expensive", "cheap_but_reason", "unknown"]);
const IR_EVENT_TYPES = new Set(["earnings", "guidance_revision", "buyback", "dividend", "capital_policy", "shareholder_meeting", "medium_term_plan", "offering", "tob", "risk_disclosure", "unknown"]);
const IR_SOURCE_STATUSES = new Set(["confirmed", "official_check_required", "missing"]);
const IR_IMPACTS = new Set(["positive", "neutral", "negative", "unknown"]);
const REVIEW_HORIZONS = new Set(["1d", "1w", "1m", "3m"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || isStrictGregorianDate(value);
}

function isNullableCanonicalText(value: unknown): value is string | null {
  return value === null || isCanonicalText(value);
}

function isCommitteeIrEventEvidence(value: unknown, asOf = todayJst()): value is IrEventEvidence {
  if (!isRecord(value)) return false;
  if (!isCanonicalText(value.code) || !isCanonicalText(value.name) || !isCanonicalText(value.title)) return false;
  if (typeof value.eventType !== "string" || !IR_EVENT_TYPES.has(value.eventType)) return false;
  if (!isNullableDate(value.publishedAt) || (value.publishedAt !== null && value.publishedAt > asOf)) return false;
  if (!isNullableDate(value.eventDate)) return false;
  if (!isNullableCanonicalText(value.sourceUrl)) return false;
  if (typeof value.sourceStatus !== "string" || !IR_SOURCE_STATUSES.has(value.sourceStatus)) return false;
  if (typeof value.impact !== "string" || !IR_IMPACTS.has(value.impact)) return false;
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return false;
  return isStringArray(value.notes);
}

function isCommitteeCodeSnapshot(value: unknown, asOf = todayJst()): value is Record<string, unknown> & { code: string } {
  if (!isRecord(value) || !isCanonicalText(value.code) || !isCanonicalText(value.name)) return false;
  if (!isStrictGregorianDate(value.asOf) || value.asOf > asOf) return false;

  const qualitySnapshot = QUALITY_LABELS.has(String(value.qualityLabel))
    && isStringArray(value.moatEvidence)
    && isStringArray(value.missingData);
  const valuationSnapshot = GROWTH_ADJUSTED_VALUATIONS.has(String(value.growthAdjustedValuation))
    && isStringArray(value.valuationRisks)
    && isStringArray(value.missingData);
  return qualitySnapshot || valuationSnapshot;
}

function isCommitteeOutcome(value: unknown, asOf = todayJst()): value is HypothesisOutcome {
  if (!isRecord(value) || !isCanonicalText(value.code) || !isRecord(value.hypothesis)) return false;
  if (!isStrictGregorianDate(value.hypothesis.detectedAt) || value.hypothesis.detectedAt > asOf) return false;
  if (typeof value.reviewHorizon !== "string" || !REVIEW_HORIZONS.has(value.reviewHorizon)) return false;
  return value.maxDrawdownPct === null
    || (
      typeof value.maxDrawdownPct === "number"
      && Number.isFinite(value.maxDrawdownPct)
      && value.maxDrawdownPct <= 0
    );
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
  return value.events.filter((event): event is IrEventEvidence => isCommitteeIrEventEvidence(event));
}

export function parseStockProCommitteeCodeSnapshots<T extends { code: string }>(value: unknown): T[] {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) return [];
  const snapshots = value.snapshots.filter((snapshot): snapshot is T => isCommitteeCodeSnapshot(snapshot));
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) counts.set(snapshot.code, (counts.get(snapshot.code) ?? 0) + 1);
  return snapshots.filter(snapshot => counts.get(snapshot.code) === 1);
}

export function parseStockProCommitteeOutcomes(value: unknown): HypothesisOutcome[] {
  if (!isRecord(value) || !Array.isArray(value.outcomes)) return [];
  const outcomes = value.outcomes.filter((outcome): outcome is HypothesisOutcome => isCommitteeOutcome(outcome));
  const counts = new Map<string, number>();
  const identity = (outcome: HypothesisOutcome) => `${outcome.code}\u0000${outcome.hypothesis.detectedAt}\u0000${outcome.reviewHorizon}`;
  for (const outcome of outcomes) {
    const key = identity(outcome);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return outcomes.filter(outcome => counts.get(identity(outcome)) === 1);
}
