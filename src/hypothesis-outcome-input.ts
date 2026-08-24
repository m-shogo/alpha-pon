import { addDaysJst, todayJst } from "./date.js";
import type { HypothesisOutcome } from "./universe.js";

type ParsedHypothesisOutcomes = {
  rows: HypothesisOutcome[];
  warnings: string[];
};

const HYPOTHESIS_RESULTS = new Set(["hit", "miss", "too_early", "invalidated", "unknown"]);
const REVIEW_HORIZONS = new Set(["1d", "1w", "1m", "3m"]);

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
  if (value.result !== undefined && (typeof value.result !== "string" || !HYPOTHESIS_RESULTS.has(value.result))) return false;
  return isRealJstDate(value.hypothesis.detectedAt) && value.hypothesis.detectedAt <= todayJst();
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
      rows.push(parsed);
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
      rows.push(parsed);
    } catch {
      malformedRecords.push(index + 1);
    }
  });

  const warnings = malformedRecords.length > 0
    ? [`${source}: ${malformedRecords.length} malformed record(s) isolated at record(s) ${malformedRecords.join(", ")}`]
    : [];

  return { rows, warnings };
}
