export type ListingAutomationJpxRow = Record<string, unknown>;

export type ListingAutomationJpxInput = {
  parsed: ListingAutomationJpxRow[];
  appendable: ListingAutomationJpxRow[];
  sourceUrl?: string;
  error?: string;
  invalid: boolean;
  reason: "ok" | "parse_error" | "invalid_root" | "invalid_parsed" | "invalid_appendable" | "invalid_rows";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseListingAutomationJpxInput(text: string): ListingAutomationJpxInput {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { parsed: [], appendable: [], invalid: true, reason: "parse_error" };
  }

  if (!isRecord(root)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_root" };
  }

  const parsedRaw = root.parsed ?? [];
  const appendableRaw = root.appendable ?? [];
  if (!Array.isArray(parsedRaw)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_parsed" };
  }
  if (!Array.isArray(appendableRaw)) {
    return { parsed: [], appendable: [], invalid: true, reason: "invalid_appendable" };
  }

  const parsed = parsedRaw.filter(isRecord);
  const appendable = appendableRaw.filter(isRecord);
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
