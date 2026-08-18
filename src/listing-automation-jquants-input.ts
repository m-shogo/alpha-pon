import { todayJst } from "./date.js";

export type ListingAutomationJquantsResult = {
  price: number | null;
  source?: "jquants" | "missing" | "error";
};

export type ListingAutomationJquantsInput = {
  targets: unknown[];
  results: ListingAutomationJquantsResult[];
  setupError: string | null;
  invalid: boolean;
  reason:
    | "ok"
    | "parse_error"
    | "invalid_root"
    | "invalid_generated_at"
    | "stale_generated_at"
    | "invalid_targets"
    | "invalid_results"
    | "invalid_rows"
    | "invalid_setup_error";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrictGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isListingAutomationJquantsSource(value: unknown): value is NonNullable<ListingAutomationJquantsResult["source"]> {
  return value === "jquants" || value === "missing" || value === "error";
}

export function parseListingAutomationJquantsInput(text: string, asOf = todayJst()): ListingAutomationJquantsInput {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "parse_error" };
  }

  if (!isRecord(root)) {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_root" };
  }

  if (!isStrictGregorianDate(root.generatedAt)) {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_generated_at" };
  }
  if (root.generatedAt !== asOf) {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "stale_generated_at" };
  }

  const targets = root.targets ?? [];
  const resultsRaw = root.results ?? [];
  if (!Array.isArray(targets)) {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_targets" };
  }
  if (!Array.isArray(resultsRaw)) {
    return { targets, results: [], setupError: null, invalid: true, reason: "invalid_results" };
  }

  const results: ListingAutomationJquantsResult[] = [];
  for (const row of resultsRaw) {
    if (!isRecord(row)) {
      return { targets, results, setupError: null, invalid: true, reason: "invalid_rows" };
    }
    const price = row.price;
    if (price !== null && price !== undefined && (typeof price !== "number" || !Number.isFinite(price))) {
      return { targets, results, setupError: null, invalid: true, reason: "invalid_rows" };
    }
    if (row.source !== undefined && !isListingAutomationJquantsSource(row.source)) {
      return { targets, results, setupError: null, invalid: true, reason: "invalid_rows" };
    }
    results.push({ price: price ?? null, source: row.source as ListingAutomationJquantsResult["source"] });
  }

  const setupError = root.setupError ?? null;
  if (setupError !== null && typeof setupError !== "string") {
    return { targets, results, setupError: null, invalid: true, reason: "invalid_setup_error" };
  }

  return { targets, results, setupError, invalid: false, reason: "ok" };
}
