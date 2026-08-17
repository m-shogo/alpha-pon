import type { HypothesisOutcome } from "./universe.js";

type ParsedHypothesisOutcomes = {
  rows: HypothesisOutcome[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsableOutcome(value: unknown): value is HypothesisOutcome {
  if (!isRecord(value)) return false;
  if (typeof value.code !== "string" || value.code.trim().length === 0) return false;
  if (!isRecord(value.hypothesis)) return false;
  return typeof value.hypothesis.detectedAt === "string" && value.hypothesis.detectedAt.trim().length > 0;
}

export function parseHypothesisOutcomesJsonl(text: string, source = "hypothesis outcomes JSONL"): ParsedHypothesisOutcomes {
  const rows: HypothesisOutcome[] = [];
  const malformedLines: number[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isUsableOutcome(parsed)) {
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
      if (!isUsableOutcome(parsed)) {
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
