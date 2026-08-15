import { existsSync, readFileSync } from "fs";

export type ReadOnlyJsonlParseError = {
  lineNumber: number;
  preview: string;
  message: string;
};

export function readJsonlWithErrors<T>(path: string): {
  rows: T[];
  parseErrors: ReadOnlyJsonlParseError[];
} {
  if (!existsSync(path)) return { rows: [], parseErrors: [] };

  const rows: T[] = [];
  const parseErrors: ReadOnlyJsonlParseError[] = [];
  const lines = readFileSync(path, "utf-8").split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      rows.push(JSON.parse(trimmed) as T);
    } catch (error) {
      parseErrors.push({
        lineNumber: index + 1,
        preview: trimmed.slice(0, 160),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return { rows, parseErrors };
}
