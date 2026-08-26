import { existsSync, readFileSync } from "fs";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quoted) throw new Error("listing CSV contains an unterminated quoted field");
  values.push(current.trim());
  return values;
}

export function readListingCsvRows(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const [headerLine, ...rows] = lines;
  const headers = parseCsvLine(headerLine);
  return rows.map(row => {
    const cols = parseCsvLine(row);
    const result: Record<string, string> = {};
    headers.forEach((header, index) => {
      result[header] = cols[index] ?? "";
    });
    return result;
  });
}
