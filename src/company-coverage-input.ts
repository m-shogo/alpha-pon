type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  const hypotheses = isRecord(hypothesesRaw) && isRecord(hypothesesRaw.categories)
    ? hypothesesRaw
    : null;
  if (!hypotheses) {
    warnings.push("company-hypotheses.yml root/categories shape is invalid");
  }

  const networkState = normalizeCompanyNetworkRoot(networkRaw);
  const network = networkState.companies && isRecord(networkRaw) ? networkRaw : null;
  if (networkState.warning) warnings.push(networkState.warning);

  return { hypotheses, network, warnings };
}
