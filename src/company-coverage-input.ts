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
  for (const [rawCode, rawCompany] of Object.entries(rawCompanies)) {
    const code = nonEmptyString(rawCode);
    if (!code) {
      warnings.push("company-network.yml company code is invalid");
      continue;
    }
    if (companies[code]) {
      warnings.push(`company-network.yml company ${code} canonical identity is duplicated`);
      continue;
    }
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

export type CompanyNetworkReportPeer = {
  code: string;
  name: string;
  relation: string;
};

export type CompanyNetworkReportCompany = {
  name: string;
  categoryHints: string[];
  peers: CompanyNetworkReportPeer[];
  customerOrDemandDrivers: string[];
  betterPeerRisk: string[];
  evidenceChecks: string[];
};

export function normalizeCompanyNetworkReportRows(
  input: CompanyNetworkRootState,
): { companies: Record<string, CompanyNetworkReportCompany>; warnings: string[] } {
  const warnings = input.warning ? [input.warning] : [];
  const companies: Record<string, CompanyNetworkReportCompany> = {};
  const rawCompanies = input.companies ?? {};

  for (const [rawCode, rawCompany] of Object.entries(rawCompanies)) {
    const code = nonEmptyString(rawCode);
    if (!code || !isRecord(rawCompany)) {
      warnings.push(`company-network.yml company ${code ?? rawCode} shape is invalid`);
      continue;
    }
    if (companies[code]) {
      warnings.push(`company-network.yml company ${code} canonical identity is duplicated`);
      continue;
    }
    const name = nonEmptyString(rawCompany.name);
    if (!name) {
      warnings.push(`company-network.yml company ${code} identity is invalid`);
      continue;
    }

    const normalizeList = (field: string): string[] => {
      const normalized = stringArray(rawCompany[field]);
      if (normalized !== null) return normalized;
      warnings.push(`company-network.yml company ${code} ${field} shape is invalid`);
      return [];
    };

    const categoryHints = normalizeList("categoryHints");
    const customerOrDemandDrivers = normalizeList("customerOrDemandDrivers");
    const betterPeerRisk = normalizeList("betterPeerRisk");
    const evidenceChecks = normalizeList("evidenceChecks");
    const peers: CompanyNetworkReportPeer[] = [];
    const rawPeers = rawCompany.peers;
    if (rawPeers !== undefined && !Array.isArray(rawPeers)) {
      warnings.push(`company-network.yml company ${code} peers shape is invalid`);
    } else if (Array.isArray(rawPeers)) {
      rawPeers.forEach((rawPeer, index) => {
        if (!isRecord(rawPeer)) {
          warnings.push(`company-network.yml company ${code} peer row ${index + 1} shape is invalid`);
          return;
        }
        const peerCode = nonEmptyString(rawPeer.code);
        const peerName = nonEmptyString(rawPeer.name);
        const relation = nonEmptyString(rawPeer.relation);
        if (!peerCode || !peerName || !relation) {
          warnings.push(`company-network.yml company ${code} peer row ${index + 1} fields are invalid`);
          return;
        }
        peers.push({ code: peerCode, name: peerName, relation });
      });
    }

    companies[code] = {
      name,
      categoryHints,
      peers,
      customerOrDemandDrivers,
      betterPeerRisk,
      evidenceChecks,
    };
  }

  return { companies, warnings };
}
