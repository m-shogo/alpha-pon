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

export type CompanyHypothesesRootState = {
  categories: UnknownRecord | null;
  warning: string | null;
};

export function normalizeCompanyHypothesesRoot(hypothesesRaw: unknown): CompanyHypothesesRootState {
  if (!isRecord(hypothesesRaw) || !isRecord(hypothesesRaw.categories)) {
    return {
      categories: null,
      warning: "company-hypotheses.yml root/categories shape is invalid",
    };
  }
  return { categories: hypothesesRaw.categories, warning: null };
}

export type CompanyNetworkRootState = {
  companies: UnknownRecord | null;
  warning: string | null;
};

export function normalizeCompanyNetworkRoot(networkRaw: unknown): CompanyNetworkRootState {
  if (!isRecord(networkRaw) || !isRecord(networkRaw.companies)) {
    return {
      companies: null,
      warning: "company-network.yml root/companies shape is invalid",
    };
  }
  return { companies: networkRaw.companies, warning: null };
}

export type CompanyCoverageRootState = {
  hypotheses: UnknownRecord | null;
  network: UnknownRecord | null;
  warnings: string[];
};

export function normalizeCompanyCoverageRoots(
  hypothesesRaw: unknown,
  networkRaw: unknown,
): CompanyCoverageRootState {
  const warnings: string[] = [];

  const hypothesesState = normalizeCompanyHypothesesRoot(hypothesesRaw);
  const hypotheses = hypothesesState.categories && isRecord(hypothesesRaw) ? hypothesesRaw : null;
  if (hypothesesState.warning) warnings.push(hypothesesState.warning);

  const networkState = normalizeCompanyNetworkRoot(networkRaw);
  const network = networkState.companies && isRecord(networkRaw) ? networkRaw : null;
  if (networkState.warning) warnings.push(networkState.warning);

  return { hypotheses, network, warnings };
}

export type CompanyCoverageHypothesisCompany = {
  code: string;
  name: string;
  status?: string;
};

export type CompanyCoverageHypothesisCategory = {
  label: string;
  companies: CompanyCoverageHypothesisCompany[];
};

export type CompanyCoverageNetworkCompany = {
  name: string;
  categoryHints: string[];
};

export type CompanyCoverageRowsState = {
  categories: Record<string, CompanyCoverageHypothesisCategory>;
  companies: Record<string, CompanyCoverageNetworkCompany>;
  warnings: string[];
};

export function normalizeCompanyCoverageRows(roots: CompanyCoverageRootState): CompanyCoverageRowsState {
  const warnings = [...roots.warnings];
  const categories: Record<string, CompanyCoverageHypothesisCategory> = {};
  const companies: Record<string, CompanyCoverageNetworkCompany> = {};

  const rawCategories = roots.hypotheses && isRecord(roots.hypotheses.categories)
    ? roots.hypotheses.categories
    : {};
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
    const normalizedCompanies: CompanyCoverageHypothesisCompany[] = [];
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
      normalizedCompanies.push({ code, name, ...(status ? { status } : {}) });
    });
    categories[categoryId] = { label, companies: normalizedCompanies };
  }

  const rawCompanies = roots.network && isRecord(roots.network.companies)
    ? roots.network.companies
    : {};
  for (const [code, rawCompany] of Object.entries(rawCompanies)) {
    if (!isRecord(rawCompany)) {
      warnings.push(`company-network.yml company ${code} shape is invalid`);
      continue;
    }
    const name = nonEmptyString(rawCompany.name);
    const categoryHints = stringArray(rawCompany.categoryHints);
    if (!name || categoryHints === null) {
      warnings.push(`company-network.yml company ${code} fields are invalid`);
      continue;
    }
    companies[code] = { name, categoryHints };
  }

  return { categories, companies, warnings };
}
