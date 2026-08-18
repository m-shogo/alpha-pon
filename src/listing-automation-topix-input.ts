import { todayJst } from "./date.js";

export type ListingAutomationTopixRow = {
  code: string;
  topixRelativeReturn: number | null;
};

export type ListingAutomationTopixInput = {
  rows: ListingAutomationTopixRow[];
  invalid: boolean;
  reason: "ok" | "parse_error" | "invalid_root" | "invalid_generated_at" | "stale_generated_at" | "invalid_rows";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseListingAutomationTopixInput(text: string, asOf = todayJst()): ListingAutomationTopixInput {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { rows: [], invalid: true, reason: "parse_error" };
  }

  if (!isRecord(root) || !Array.isArray(root.rows)) {
    return { rows: [], invalid: true, reason: "invalid_root" };
  }
  if (!isStrictGregorianDate(root.generatedAt)) {
    return { rows: [], invalid: true, reason: "invalid_generated_at" };
  }
  if (root.generatedAt !== asOf) {
    return { rows: [], invalid: true, reason: "stale_generated_at" };
  }

  const rows: ListingAutomationTopixRow[] = [];
  for (const row of root.rows) {
    if (!isRecord(row)) {
      return { rows, invalid: true, reason: "invalid_rows" };
    }
    const code = row.code;
    if (typeof code !== "string" || code.length === 0 || code !== code.trim()) {
      return { rows, invalid: true, reason: "invalid_rows" };
    }
    const value = row.topixRelativeReturn;
    if (value !== null && value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      return { rows, invalid: true, reason: "invalid_rows" };
    }
    rows.push({ code, topixRelativeReturn: value ?? null });
  }

  return { rows, invalid: false, reason: "ok" };
}
