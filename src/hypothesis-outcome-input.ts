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

function parseOutcomePayloads(payloads: string[], source: string, unit: string): ParsedHypothesisOutcomes {
  const rows: HypothesisOutcome[] = [];
  const malformedIndexes: number[] = [];

  payloads.forEach((payload, index) => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!isUsableOutcome(parsed)) {
        malformedIndexes.push(index + 1);
        return;
      }
      rows.push(parsed);
    } catch {
      malformedIndexes.push(index + 1);
    }
  });

  const warnings = malformedIndexes.length > 0
    ? [`${source}: ${malformedIndexes.length} malformed ${unit}(s) isolated at ${unit}(s) ${malformedIndexes.join(", ")}`]
    : [];

  return { rows, warnings };
}

export function parseHypothesisOutcomesJsonl(text: string, source = "hypothesis outcomes JSONL"): ParsedHypothesisOutcomes {
  const payloads: string[] = [];
  const lineNumbers: number[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    payloads.push(line);
    lineNumbers.push(index + 1);
  });

  const parsed = parseOutcomePayloads(payloads, source, "row");
  if (parsed.warnings.length === 0) return parsed;

  const malformedRows = parsed.warnings[0]
    .match(/row\(s\) ([\d, ]+)$/)?.[1]
    .split(", ")
    .map(value => Number(value)) ?? [];
  const malformedLines = malformedRows.map(rowNumber => lineNumbers[rowNumber - 1]).filter((value): value is number => Number.isInteger(value));

  return {
    rows: parsed.rows,
    warnings: [`${source}: ${malformedLines.length} malformed JSONL row(s) isolated at line(s) ${malformedLines.join(", ")}`],
  };
}

export function parseHypothesisOutcomeSqlitePayloads(
  payloads: string[],
  source = "hypothesis_outcomes SQLite payload",
): ParsedHypothesisOutcomes {
  return parseOutcomePayloads(payloads, source, "record");
}
