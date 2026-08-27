import { addDaysJst, todayJst } from "./date.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalNonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.trim().length === 0 || value !== value.trim()) return null;
  return value;
}

function canonicalPastDate(value: unknown, asOf: string): string | null {
  const candidate = canonicalNonBlankString(value);
  if (!candidate) return null;
  try {
    return addDaysJst(candidate, 0) === candidate && candidate <= asOf ? candidate : null;
  } catch {
    return null;
  }
}

export type StaleHypothesisCompany = {
  code: string;
  name: string;
  status?: string;
  lastReviewedAt?: string;
};

export type StaleHypothesisCategory = {
  label: string;
  companies: StaleHypothesisCompany[];
};

export type StaleHypothesisConfigState = {
  categories: StaleHypothesisCategory[];
  warnings: string[];
};

export function normalizeStaleHypothesisConfig(value: unknown, asOf = todayJst()): StaleHypothesisConfigState {
  const warnings: string[] = [];
  if (!isRecord(value) || !isRecord(value.categories)) {
    return { categories: [], warnings: ["company-hypotheses.yml root/categories shape is invalid"] };
  }

  const categories: StaleHypothesisCategory[] = [];
  for (const [categoryId, rawCategory] of Object.entries(value.categories)) {
    if (!isRecord(rawCategory)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} shape is invalid`);
      continue;
    }
    const label = canonicalNonBlankString(rawCategory.label);
    if (!label) {
      warnings.push(`company-hypotheses.yml category ${categoryId} label is invalid`);
      continue;
    }
    if (!Array.isArray(rawCategory.companies)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} companies shape is invalid`);
      continue;
    }

    const companies: StaleHypothesisCompany[] = [];
    const seenCodes = new Set<string>();
    rawCategory.companies.forEach((rawCompany, index) => {
      if (!isRecord(rawCompany)) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company row ${index + 1} shape is invalid`);
        return;
      }
      const code = canonicalNonBlankString(rawCompany.code);
      const name = canonicalNonBlankString(rawCompany.name);
      if (!code || !name) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company row ${index + 1} identity is invalid`);
        return;
      }
      if (seenCodes.has(code)) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company ${code} canonical identity is duplicated`);
        return;
      }
      seenCodes.add(code);

      const status = rawCompany.status === undefined ? undefined : canonicalNonBlankString(rawCompany.status);
      const lastReviewedAt = rawCompany.lastReviewedAt === undefined ? undefined : canonicalPastDate(rawCompany.lastReviewedAt, asOf);
      if (rawCompany.status !== undefined && !status) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company ${code} status is invalid`);
      }
      if (rawCompany.lastReviewedAt !== undefined && !lastReviewedAt) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company ${code} lastReviewedAt is invalid`);
      }

      companies.push({
        code,
        name,
        ...(status ? { status } : {}),
        ...(lastReviewedAt ? { lastReviewedAt } : {}),
      });
    });
    categories.push({ label, companies });
  }

  return { categories, warnings };
}
