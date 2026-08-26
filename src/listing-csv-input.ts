import { readReadOnlyTextFile } from "./read-only-text-file.js";

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
  const text = readReadOnlyTextFile(path);
  if (!text) return [];
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const [headerLine, ...rows] = lines;
  const headers = parseCsvLine(headerLine);
  const seenHeaders = new Set<string>();
  for (const header of headers) {
    if (seenHeaders.has(header)) throw new Error(`listing CSV contains a duplicate header: ${header}`);
    seenHeaders.add(header);
  }
  return rows.map(row => {
    const cols = parseCsvLine(row);
    const result: Record<string, string> = {};
    headers.forEach((header, index) => {
      result[header] = cols[index] ?? "";
    });
    return result;
  });
}

export function readListingCsvRowsByUniqueCode(path: string): Record<string, string>[] {
  const rows = readListingCsvRows(path);
  const seenCodes = new Set<string>();
  for (const row of rows) {
    const code = row.code;
    if (typeof code !== "string" || code.length === 0 || code !== code.trim()) {
      throw new Error("listing CSV contains a non-canonical code identity");
    }
    if (seenCodes.has(code)) {
      throw new Error(`listing CSV contains a duplicate code identity: ${code}`);
    }
    seenCodes.add(code);
  }
  return rows;
}
