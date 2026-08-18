import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { AnalogyPredictionRecord } from "./analysis/analogy-db.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type AnalogyReviewPredictionInput = {
  rows: AnalogyPredictionRecord[];
  warnings: string[];
};

export function loadAnalogyPredictionsForReview(dir: string): AnalogyReviewPredictionInput {
  if (!existsSync(dir)) return { rows: [], warnings: [] };

  const rows: AnalogyPredictionRecord[] = [];
  const warnings: string[] = [];

  for (const file of readdirSync(dir).filter(name => name.endsWith(".jsonl")).sort()) {
    const path = join(dir, file);
    const parsed = readJsonlWithErrors<AnalogyPredictionRecord>(path);
    rows.push(...parsed.rows);
    const warning = formatReadOnlyJsonlParseWarning(path, parsed.parseErrors);
    if (warning) warnings.push(warning);
  }

  return { rows, warnings };
}
