type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

  const network = isRecord(networkRaw) && isRecord(networkRaw.companies)
    ? networkRaw
    : null;
  if (!network) {
    warnings.push("company-network.yml root/companies shape is invalid");
  }

  return { hypotheses, network, warnings };
}
