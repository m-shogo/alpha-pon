import type { StockCandidateHypothesis } from "./universe.js";

export type StockCandidateHypothesisJsonlRead = {
  rows: StockCandidateHypothesis[];
  warnings: string[];
};

export function parseExistingStockCandidateHypothesesJsonl(
  text: string,
  sourceLabel = "data/hypothesis_predictions.jsonl",
): StockCandidateHypothesisJsonlRead {
  const rows: StockCandidateHypothesis[] = [];
  const malformedLineNumbers: number[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      rows.push(JSON.parse(line) as StockCandidateHypothesis);
    } catch {
      malformedLineNumbers.push(index + 1);
    }
  });

  return {
    rows,
    warnings:
      malformedLineNumbers.length === 0
        ? []
        : [
            `${sourceLabel}: ignored ${malformedLineNumbers.length} malformed JSONL row(s) at line(s) ${malformedLineNumbers.join(", ")}`,
          ],
  };
}
