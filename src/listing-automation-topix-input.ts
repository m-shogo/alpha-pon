export type ListingAutomationTopixRow = {
  topixRelativeReturn: number | null;
};

export type ListingAutomationTopixInput = {
  rows: ListingAutomationTopixRow[];
  invalid: boolean;
  reason: "ok" | "parse_error" | "invalid_root" | "invalid_rows";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseListingAutomationTopixInput(text: string): ListingAutomationTopixInput {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { rows: [], invalid: true, reason: "parse_error" };
  }

  if (!isRecord(root) || !Array.isArray(root.rows)) {
    return { rows: [], invalid: true, reason: "invalid_root" };
  }

  const rows: ListingAutomationTopixRow[] = [];
  for (const row of root.rows) {
    if (!isRecord(row)) {
      return { rows, invalid: true, reason: "invalid_rows" };
    }
    const value = row.topixRelativeReturn;
    if (value !== null && value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      return { rows, invalid: true, reason: "invalid_rows" };
    }
    rows.push({ topixRelativeReturn: value ?? null });
  }

  return { rows, invalid: false, reason: "ok" };
}
