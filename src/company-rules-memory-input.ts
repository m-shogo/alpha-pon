export type CompanyRulesMemoryRecord = {
  code?: string;
  watchReason?: string[];
  knownRisks?: string[];
  recurringWarnings?: string[];
};

export type CompanyRulesMemoryInputResult = {
  record: CompanyRulesMemoryRecord | null;
  status: "ok" | "invalid_root" | "invalid_field";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

export function normalizeCompanyRulesMemoryInput(raw: unknown): CompanyRulesMemoryInputResult {
  if (!isRecord(raw)) {
    return { record: null, status: "invalid_root" };
  }

  for (const key of ["watchReason", "knownRisks", "recurringWarnings"] as const) {
    const value = raw[key];
    if (value !== undefined && !isStringArray(value)) {
      return { record: null, status: "invalid_field" };
    }
  }

  if (raw.code !== undefined && typeof raw.code !== "string") {
    return { record: null, status: "invalid_field" };
  }

  return { record: raw as CompanyRulesMemoryRecord, status: "ok" };
}
