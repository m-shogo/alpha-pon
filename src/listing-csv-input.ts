import { existsSync, readFileSync } from "fs";

export function readListingCsvRows(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",").map(header => header.trim());
  return rows.map(row => {
    const cols = row.split(",").map(value => value.trim());
    const result: Record<string, string> = {};
    headers.forEach((header, index) => {
      result[header] = cols[index] ?? "";
    });
    return result;
  });
}
