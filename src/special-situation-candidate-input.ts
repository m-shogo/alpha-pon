export type SpecialSituationCandidateIdentity = {
  code: string;
  name: string;
};

export type SpecialSituationCandidateInput = {
  candidates: SpecialSituationCandidateIdentity[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSpecialSituationCandidates(
  value: unknown,
  sourceLabel: string,
): SpecialSituationCandidateInput {
  if (!isRecord(value)) {
    return {
      candidates: [],
      warnings: [`${sourceLabel}: config root must be an object`],
    };
  }

  const rawCandidates = value.candidates;
  if (rawCandidates === undefined) {
    return {
      candidates: [],
      warnings: [`${sourceLabel}: candidates is required`],
    };
  }
  if (!Array.isArray(rawCandidates)) {
    return {
      candidates: [],
      warnings: [`${sourceLabel}: candidates must be an array`],
    };
  }

  const warnings: string[] = [];
  const valid: SpecialSituationCandidateIdentity[] = [];
  const countsByCode = new Map<string, number>();

  for (const [index, row] of rawCandidates.entries()) {
    if (!isRecord(row)) {
      warnings.push(`${sourceLabel}: candidates[${index}] must be an object`);
      continue;
    }

    const { code, name } = row;
    if (
      typeof code !== "string" ||
      code.length === 0 ||
      code.trim() !== code ||
      typeof name !== "string" ||
      name.trim().length === 0
    ) {
      warnings.push(`${sourceLabel}: candidates[${index}] has invalid canonical code/name`);
      continue;
    }

    valid.push({ code, name });
    countsByCode.set(code, (countsByCode.get(code) ?? 0) + 1);
  }

  const duplicateCodes = new Set(
    [...countsByCode.entries()]
      .filter(([, count]) => count > 1)
      .map(([code]) => code),
  );
  if (duplicateCodes.size > 0) {
    warnings.push(
      `${sourceLabel}: duplicate candidate code(s) isolated: ${[...duplicateCodes].sort().join(", ")}`,
    );
  }

  return {
    candidates: valid.filter(candidate => !duplicateCodes.has(candidate.code)),
    warnings,
  };
}
