import { addDaysJst } from "./date.js";

export function selectSourceHealthScoreFile(files: string[], asOf: string): string | null {
  let canonicalAsOf: string;
  try {
    canonicalAsOf = addDaysJst(asOf, 0);
  } catch {
    return null;
  }

  return files
    .map(file => ({ file, date: file.match(/^scores_(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? null }))
    .filter((entry): entry is { file: string; date: string } => entry.date !== null)
    .filter(entry => {
      try {
        return addDaysJst(entry.date, 0) === entry.date && entry.date <= canonicalAsOf;
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.file ?? null;
}
