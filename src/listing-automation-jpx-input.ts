import { todayJst } from "./date.js";

export type ListingAutomationJpxRow = Record<string, unknown>;

export type ListingAutomationJpxInput = {
  parsed: ListingAutomationJpxRow[];
  appendable: ListingAutomationJpxRow[];
  sourceUrl?: string;
  error?: string;
  invalid: boolean;
  reason:
    | "ok"
    | "parse_error"
    | "invalid_root"
    | "invalid_generated_at"
    | "stale_generated_at"
    | "invalid_parsed"
    | "invalid_appendable"
    | "invalid_rows";
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

function isCanonicalNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function isOptionalListingCode(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && /^(\d{4}|\d{3}[A-Z])$/.test(value));
}

function isParsedListingRow(value: unknown): value is ListingAutomationJpxRow {
  if (!isRecord(value)) return false;
  return (
    isOptionalListingCode(value.code) &&
    isCanonicalNonBlankString(value.name) &&
    isStrictGregorianDate(value.listingDate) &&
    typeof value.raw === "string" && value.raw.trim().length > 0 &&
    (value.parser === "csv_like" || value.parser === "html_table" || value.parser === "regex_fallback") &&
    (value.sourceUrl === undefined || typeof value.sourceUrl === "string")
  );
}

function isAppendableListingRow(value: unknown): value is ListingAutomationJpxRow {
  if (!isRecord(value)) return false;
  return (
    isCanonicalNonBlankString(value.id) &&
    isOptionalListingCode(value.code) &&
    isCanonicalNonBlankString(value.name) &&
    value.eventType === "listing_day" &&
    isStrictGregorianDate(value.eventDate) &&
    isCanonicalNonBlankString(value.source) &&
    typeof value.sourceUrl === "string" &&
    value.status === "watch" &&
    value.notificationLevel === "priority"
  );
}

export function parseListingAutomationJpxInput(text: string, asOf = todayJst()): ListingAutomationJpxInput {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { parsed: [], appendable: [], invalid: true, reason: "parse_error" };
  }

  if (!isRecord(root)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_root" };
  }
  if (!isStrictGregorianDate(root.generatedAt)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_generated_at" };
  }
  if (root.generatedAt !== asOf) {
    return { parsed: [], appendable: [], invalid: true, reason: "stale_generated_at" };
  }

  const parsedRaw = root.parsed ?? [];
  const appendableRaw = root.appendable ?? [];
  if (!Array.isArray(parsedRaw)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_parsed" };
  }
  if (!Array.isArray(appendableRaw)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_appendable" };
  }

  const parsed = parsedRaw.filter(isParsedListingRow);
  const appendable = appendableRaw.filter(isAppendableListingRow);
  if (parsed.length !== parsedRaw.length || appendable.length !== appendableRaw.length) {
    return { parsed, appendable, invalid: true, reason: "invalid_rows" };
  }

  return {
    parsed,
    appendable,
    sourceUrl: typeof root.sourceUrl === "string" ? root.sourceUrl : undefined,
    error: typeof root.error === "string" ? root.error : undefined,
    invalid: false,
    reason: "ok",
  };
}
