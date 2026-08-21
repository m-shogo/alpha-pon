import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addDaysJst, todayJst } from "./date.js";

export type RuleDiagnosticsScoreLoad<T> = {
  rows: T[];
  warnings: string[];
};

function isRealDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isUsableRuleDiagnosticsScoreRow(value: unknown, expectedDate: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.code !== "string" || row.code.length === 0 || row.code !== row.code.trim()) return false;
  if (typeof row.createdAt !== "string" || !isRealDate(row.createdAt) || row.createdAt !== expectedDate) return false;
  if (row.rules !== undefined) {
    if (!Array.isArray(row.rules)) return false;
    if (!row.rules.every(rule => typeof rule === "string" && rule.length > 0 && rule === rule.trim())) return false;
  }
  return true;
}

export function readRuleDiagnosticsScoreRows<T>(
  reportsDir = "reports",
  asOf = todayJst(),
): RuleDiagnosticsScoreLoad<T> {
  if (!existsSync(reportsDir)) return { rows: [], warnings: [] };

  const rows: T[] = [];
  const warnings: string[] = [];
  for (const file of readdirSync(reportsDir).filter(name => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
    const snapshotDate = file.slice("scores_".length, -".json".length);
    if (!isRealDate(snapshotDate)) {
      warnings.push(`${file}: invalid_snapshot_date`);
      continue;
    }
    if (snapshotDate > asOf) {
      warnings.push(`${file}: future_snapshot`);
      continue;
    }

    const path = join(reportsDir, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    } catch {
      warnings.push(`${file}: invalid_json`);
      continue;
    }

    if (!Array.isArray(parsed)) {
      warnings.push(`${file}: invalid_root`);
      continue;
    }

    const invalidRows: number[] = [];
    parsed.forEach((row, index) => {
      if (isUsableRuleDiagnosticsScoreRow(row, snapshotDate)) {
        rows.push(row as T);
      } else {
        invalidRows.push(index + 1);
      }
    });
    if (invalidRows.length > 0) {
      warnings.push(`${file}: ${invalidRows.length} malformed score row(s) at row(s) ${invalidRows.join(", ")}`);
    }
  }

  return { rows, warnings };
}
