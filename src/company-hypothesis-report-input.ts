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

function stringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean);
  return normalized.length === value.length ? normalized : null;
}

export type CompanyHypothesisReportCompany = {
  code: string;
  name: string;
  role: string;
  status: string;
  upsideHypothesis: string;
  noMoveHypothesis: string;
  downsideHypothesis: string;
  notGoodWhen: string[];
  relatedCompanies: string[];
  evidenceToCheck: string[];
  nonMoveReasonCandidates: string[];
  lastReviewedAt?: string;
};

export type CompanyHypothesisReportCategory = {
  label: string;
  thesis: string;
  companies: CompanyHypothesisReportCompany[];
};

export function normalizeCompanyHypothesisReportRows(
  input: CompanyHypothesesRootState,
): { categories: Record<string, CompanyHypothesisReportCategory>; warnings: string[] } {
  const warnings = input.warning ? [input.warning] : [];
  const categories: Record<string, CompanyHypothesisReportCategory> = {};
  const rawCategories = input.categories ?? {};

  for (const [categoryId, rawCategory] of Object.entries(rawCategories)) {
    if (!isRecord(rawCategory)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} shape is invalid`);
      continue;
    }
    const label = nonEmptyString(rawCategory.label) ?? categoryId;
    const thesis = nonEmptyString(rawCategory.thesis) ?? "N/A";
    if (!nonEmptyString(rawCategory.label) || !nonEmptyString(rawCategory.thesis)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} label/thesis is invalid`);
    }

    const rawCompanies = rawCategory.companies === undefined ? [] : rawCategory.companies;
    if (!Array.isArray(rawCompanies)) {
      warnings.push(`company-hypotheses.yml category ${categoryId} companies shape is invalid`);
      categories[categoryId] = { label, thesis, companies: [] };
      continue;
    }

    const companies: CompanyHypothesisReportCompany[] = [];
    rawCompanies.forEach((rawCompany, index) => {
      if (!isRecord(rawCompany)) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company row ${index + 1} shape is invalid`);
        return;
      }
      const code = nonEmptyString(rawCompany.code);
      const name = nonEmptyString(rawCompany.name);
      const role = nonEmptyString(rawCompany.role);
      const status = nonEmptyString(rawCompany.status);
      const upsideHypothesis = nonEmptyString(rawCompany.upsideHypothesis);
      const noMoveHypothesis = nonEmptyString(rawCompany.noMoveHypothesis);
      const downsideHypothesis = nonEmptyString(rawCompany.downsideHypothesis);
      if (!code || !name || !role || !status || !upsideHypothesis || !noMoveHypothesis || !downsideHypothesis) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company row ${index + 1} required fields are invalid`);
        return;
      }

      const normalizeList = (field: string): string[] => {
        const normalized = stringArray(rawCompany[field]);
        if (normalized !== null) return normalized;
        warnings.push(`company-hypotheses.yml category ${categoryId} company ${code} ${field} shape is invalid`);
        return [];
      };
      const lastReviewedAt = nonEmptyString(rawCompany.lastReviewedAt);
      if (rawCompany.lastReviewedAt !== undefined && !lastReviewedAt) {
        warnings.push(`company-hypotheses.yml category ${categoryId} company ${code} lastReviewedAt is invalid`);
      }

      companies.push({
        code,
        name,
        role,
        status,
        upsideHypothesis,
        noMoveHypothesis,
        downsideHypothesis,
        notGoodWhen: normalizeList("notGoodWhen"),
        relatedCompanies: normalizeList("relatedCompanies"),
        evidenceToCheck: normalizeList("evidenceToCheck"),
        nonMoveReasonCandidates: normalizeList("nonMoveReasonCandidates"),
        ...(lastReviewedAt ? { lastReviewedAt } : {}),
      });
    });
    categories[categoryId] = { label, thesis, companies };
  }

  return { categories, warnings };
}
