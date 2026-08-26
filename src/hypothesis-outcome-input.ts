import { addDaysJst, todayJst } from "./date.js";
import type { HypothesisOutcome } from "./universe.js";

type ParsedHypothesisOutcomes = {
  rows: HypothesisOutcome[];
  warnings: string[];
};

const HYPOTHESIS_RESULTS = new Set(["hit", "miss", "too_early", "invalidated", "unknown"]);
const REVIEW_HORIZONS = new Set(["1d", "1w", "1m", "3m"]);
const ACTION_LABELS = new Set(["watch", "log", "ignore"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRealJstDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isOptionalNullableFiniteNumber(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isUsableHypothesisOutcomeInput(value: unknown): value is HypothesisOutcome {
  if (!isRecord(value)) return false;
  if (typeof value.code !== "string" || value.code.trim().length === 0 || value.code !== value.code.trim()) return false;
  if (!isRecord(value.hypothesis)) return false;
  if (
    value.hypothesis.code !== undefined
    && (
      typeof value.hypothesis.code !== "string"
      || value.hypothesis.code !== value.hypothesis.code.trim()
      || value.hypothesis.code !== value.code
    )
  ) return false;
  if (typeof value.reviewHorizon !== "string" || !REVIEW_HORIZONS.has(value.reviewHorizon)) return false;
  if (value.actionLabel !== undefined && (typeof value.actionLabel !== "string" || !ACTION_LABELS.has(value.actionLabel))) return false;
  if (value.result !== undefined && (typeof value.result !== "string" || !HYPOTHESIS_RESULTS.has(value.result))) return false;
  if (!isOptionalNullableFiniteNumber(value.return1w)) return false;
  if (!isOptionalNullableFiniteNumber(value.return1m)) return false;
  if (!isOptionalNullableFiniteNumber(value.relativeToTopix1m)) return false;
  if (!isOptionalNullableFiniteNumber(value.maxDrawdownPct)) return false;
  if (!isRealJstDate(value.hypothesis.detectedAt) || value.hypothesis.detectedAt > todayJst()) return false;
  if (
    value.evaluatedAt !== undefined
    && (
      !isRealJstDate(value.evaluatedAt)
      || value.evaluatedAt < value.hypothesis.detectedAt
      || value.evaluatedAt > todayJst()
    )
  ) return false;
  return true;
}

function normalizeHypothesisOutcomeInput(value: HypothesisOutcome): HypothesisOutcome {
  return value.result === undefined ? { ...value, result: "unknown" } : value;
}

export function parseHypothesisOutcomesJsonl(text: string, source = "hypothesis outcomes JSONL"): ParsedHypothesisOutcomes {
  const rows: HypothesisOutcome[] = [];
  const malformedLines: number[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isUsableHypothesisOutcomeInput(parsed)) {
        malformedLines.push(index + 1);
        return;
      }
      rows.push(normalizeHypothesisOutcomeInput(parsed));
    } catch {
      malformedLines.push(index + 1);
    }
  });

  const warnings = malformedLines.length > 0
    ? [`${source}: ${malformedLines.length} malformed JSONL row(s) isolated at line(s) ${malformedLines.join(", ")}`]
    : [];

  return { rows, warnings };
}

export function parseHypothesisOutcomeSqlitePayloads(
  payloads: string[],
  source = "hypothesis_outcomes SQLite payload",
): ParsedHypothesisOutcomes {
  const rows: HypothesisOutcome[] = [];
  const malformedRecords: number[] = [];

  payloads.forEach((payload, index) => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!isUsableHypothesisOutcomeInput(parsed)) {
        malformedRecords.push(index + 1);
        return;
      }
      rows.push(normalizeHypothesisOutcomeInput(parsed));
    } catch {
      malformedRecords.push(index + 1);
    }
  });

  const warnings = malformedRecords.length > 0
    ? [`${source}: ${malformedRecords.length} malformed record(s) isolated at record(s) ${malformedRecords.join(", ")}`]
    : [];

  return { rows, warnings };
}
