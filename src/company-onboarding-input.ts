type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}

export function hasCanonicalStringItems(value: unknown, minItems: number): boolean {
  return Array.isArray(value)
    && value.length >= minItems
    && value.every(item => typeof item === "string" && item.length > 0 && item.trim() === item);
}

export type CompanyOnboardingPolicyCheck = {
  id: string;
  label: string;
  why: string;
};

export function normalizeCompanyOnboardingPolicyChecks(value: unknown): {
  checks: CompanyOnboardingPolicyCheck[];
  warnings: string[];
} {
  if (value === undefined) return { checks: [], warnings: [] };
  if (!Array.isArray(value)) {
    return { checks: [], warnings: ["company-onboarding-policy.yml mandatoryChecks shape is invalid"] };
  }

  const checks: CompanyOnboardingPolicyCheck[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  value.forEach((rawCheck, index) => {
    if (!isRecord(rawCheck)) {
      warnings.push(`company-onboarding-policy.yml mandatory check row ${index + 1} shape is invalid`);
      return;
    }
    const id = canonicalString(rawCheck.id);
    const label = canonicalString(rawCheck.label);
    const why = canonicalString(rawCheck.why);
    if (!id || !label || !why) {
      warnings.push(`company-onboarding-policy.yml mandatory check row ${index + 1} fields are invalid`);
      return;
    }
    if (seenIds.has(id)) {
      warnings.push(`company-onboarding-policy.yml mandatory check ${id} canonical identity is duplicated`);
      return;
    }
    seenIds.add(id);
    checks.push({ id, label, why });
  });

  return { checks, warnings };
}
