export type CompanyRulesUniverseInputStatus = "ok" | "invalid_root" | "invalid_candidates";

export type CompanyRulesUniverseInputResult = {
  rows: Record<string, unknown>[];
  status: CompanyRulesUniverseInputStatus;
  invalidRowCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  const rows = candidates.filter(isRecord);
  return {
    rows,
    status: "ok",
    invalidRowCount: candidates.length - rows.length,
  };
}
