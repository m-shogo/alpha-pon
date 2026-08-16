export type CompanyRulesUniverseInputStatus = "ok" | "invalid_root" | "invalid_candidates";

export type CompanyRulesUniverseInputResult = {
  rows: Record<string, unknown>[];
  status: CompanyRulesUniverseInputStatus;
  invalidRowCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isPriceRiskWarningArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => {
    if (!isRecord(item)) return false;
    return (item.level === "info" || item.level === "warning" || item.level === "block")
      && typeof item.reason === "string"
      && isStringArray(item.evidence);
  });
}

function isCanonicalNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function isOptionalFiniteNumberOrNull(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCompanyRulesCandidateRow(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;

  if (!isCanonicalNonEmptyString(value.code) || !isCanonicalNonEmptyString(value.name)) {
    return false;
  }

  if (value.dataSource !== "jquants" && value.dataSource !== "mock") {
    return false;
  }

  for (const key of [
    "currentPrice",
    "drawdownPct",
    "operatingProfitYoY",
    "change5dPct",
    "change20dPct",
    "topixChange5dPct",
    "topixChange20dPct",
    "relativeTopix5dPct",
    "relativeTopix20dPct",
    "volumeSpikeRatio",
  ] as const) {
    if (!isOptionalFiniteNumberOrNull(value[key])) return false;
  }

  for (const key of ["matchedWorldEventTags", "warnings"] as const) {
    const field = value[key];
    if (field !== undefined && !isStringArray(field)) return false;
  }

  if (value.priceRiskWarnings !== undefined && !isPriceRiskWarningArray(value.priceRiskWarnings)) {
    return false;
  }

  return true;
}

export function normalizeCompanyRulesUniverseInput(raw: unknown): CompanyRulesUniverseInputResult {
  let candidates: unknown;

  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (isRecord(raw)) {
    candidates = raw.candidates;
    if (candidates === undefined) {
      return { rows: [], status: "invalid_root", invalidRowCount: 0 };
    }
  } else {
    return { rows: [], status: "invalid_root", invalidRowCount: 0 };
  }

  if (!Array.isArray(candidates)) {
    return { rows: [], status: "invalid_candidates", invalidRowCount: 0 };
  }

  const validRows = candidates.filter(isCompanyRulesCandidateRow);
  const codeCounts = new Map<string, number>();
  for (const row of validRows) {
    const code = row.code as string;
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }
  const rows = validRows.filter(row => codeCounts.get(row.code as string) === 1);

  return {
    rows,
    status: "ok",
    invalidRowCount: candidates.length - rows.length,
  };
}
