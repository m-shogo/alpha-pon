type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
