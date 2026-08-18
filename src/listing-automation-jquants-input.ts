export type ListingAutomationJquantsResult = {
  price: number | null;
  source?: "jquants" | "missing" | "error";
};

export type ListingAutomationJquantsInput = {
  targets: unknown[];
  results: ListingAutomationJquantsResult[];
  setupError: string | null;
  invalid: boolean;
  reason: "ok" | "parse_error" | "invalid_root" | "invalid_targets" | "invalid_results" | "invalid_rows" | "invalid_setup_error";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isListingAutomationJquantsSource(value: unknown): value is NonNullable<ListingAutomationJquantsResult["source"]> {
  return value === "jquants" || value === "missing" || value === "error";
}

export function parseListingAutomationJquantsInput(text: string): ListingAutomationJquantsInput {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "parse_error" };
  }

  if (!isRecord(root)) {
    return { targets: [], results: [], setupError: null, invalid: true, reason: "invalid_root" };
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