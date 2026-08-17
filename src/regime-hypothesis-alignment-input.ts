import type { CompanyHypothesesRootState } from "./company-coverage-input.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export function normalizeActiveRegimeCategoryIds(value: unknown): { categoryIds: string[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return { categoryIds: [], warnings: ["current-regime.yml root shape is invalid"] };
  }
  const rawRegimes = value.activeRegimes;
  if (rawRegimes === undefined) return { categoryIds: [], warnings };
  if (!Array.isArray(rawRegimes)) {
    return { categoryIds: [], warnings: ["current-regime.yml activeRegimes shape is invalid"] };
  }

  const categoryIds: string[] = [];
  rawRegimes.forEach((rawRegime, regimeIndex) => {
    if (!isRecord(rawRegime)) {
      warnings.push(`current-regime.yml activeRegimes row ${regimeIndex + 1} shape is invalid`);
      return;
    }
    const rawCategories = rawRegime.watchCategories;
    if (rawCategories === undefined) return;
    if (!Array.isArray(rawCategories)) {
      warnings.push(`current-regime.yml activeRegimes row ${regimeIndex + 1} watchCategories shape is invalid`);
      return;
    }
    rawCategories.forEach((rawCategory, categoryIndex) => {
      const categoryId = nonEmptyString(rawCategory);
      if (!categoryId) {
        warnings.push(`current-regime.yml activeRegimes row ${regimeIndex + 1} watchCategories item ${categoryIndex + 1} is invalid`);
        return;
      }
      categoryIds.push(categoryId);
    });
  });

  return { categoryIds: [...new Set(categoryIds)], warnings };
}

export type AlignmentCompany = { code: string; name: string; status?: string };
export type AlignmentCategory = { label: string; companies: AlignmentCompany[] };

export function normalizeAlignmentHypothesisCategories(
  input: CompanyHypothesesRootState,
): { categories: Record<string, AlignmentCategory>; warnings: string[] } {
  const warnings = input.warning ? [input.warning] : [];
  const categories: Record<string, AlignmentCategory> = {};
  const rawCategories = input.categories ?? {};

  for (const [categoryId, rawCategory] of Object.entries(rawCategories)) {
    if (!isRecord(rawCategory)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} shape is invalid`);
      continue;
    }
    const label = nonEmptyString(rawCategory.label) ?? categoryId;
    const rawCompanies = rawCategory.companies === undefined ? [] : rawCategory.companies;
    if (!Array.isArray(rawCompanies)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} companies shape is invalid`);
      categories[categoryId] = { label, companies: [] };
      continue;
    }

    const companies: AlignmentCompany[] = [];
    rawCompanies.forEach((rawCompany, index) => {
      if (!isRecord(rawCompany)) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company row ${index + 1} shape is invalid`);
        return;
      }
      const code = nonEmptyString(rawCompany.code);
      const name = nonEmptyString(rawCompany.name);
      if (!code || !name) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company row ${index + 1} identity is invalid`);
        return;
      }
      const status = nonEmptyString(rawCompany.status);
      companies.push({ code, name, ...(status ? { status } : {}) });
    });
    categories[categoryId] = { label, companies };
  }

  return { categories, warnings };
}
