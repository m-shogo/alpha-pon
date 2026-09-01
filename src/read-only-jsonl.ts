import { existsSync, lstatSync, readFileSync } from "fs";

export type ReadOnlyJsonlParseError = {
  lineNumber: number;
  preview: string;
  message: string;
};

function fileReadError(message: string): ReadOnlyJsonlParseError {
  return {
    lineNumber: 0,
    preview: "",
    message,
  };
}

export function readJsonlWithErrors<T>(path: string): {
  rows: T[];
  parseErrors: ReadOnlyJsonlParseError[];
} {
  if (!existsSync(path)) return { rows: [], parseErrors: [] };

  let contents: string;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1) {
      return { rows: [], parseErrors: [fileReadError("non_regular_file")] };
    }
    contents = readFileSync(path, "utf-8");
  } catch {
    return { rows: [], parseErrors: [fileReadError("read_error")] };
  }

  const rows: T[] = [];
  const parseErrors: ReadOnlyJsonlParseError[] = [];
  const lines = contents.split("\n");

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

export function formatReadOnlyJsonlParseWarning(
  path: string,
  parseErrors: ReadOnlyJsonlParseError[],
): string | null {
  if (parseErrors.length === 0) return null;
  const fileErrors = parseErrors.filter(error => error.lineNumber === 0);
  if (fileErrors.length > 0) {
    const cause = fileErrors[0]?.message || "read_error";
    return `${path}: ${cause} ${fileErrors.length}`;
  }
  const lines = parseErrors.slice(0, 8).map(error => error.lineNumber).join(", ");
  const suffix = parseErrors.length > 8 ? ", …" : "";
  return `${path}: parse_error ${parseErrors.length} (lines ${lines}${suffix})`;
}