export type CompanyRulesWatchlistRow = {
  code: string;
  name: string;
  tags: string[];
  rules: string[];
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean);
}

export function normalizeCompanyRulesWatchlistRow(value: unknown): CompanyRulesWatchlistRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!code || !name) return null;

  return {
    code,
    name,
    tags: normalizeStringArray(row.tags),
    rules: normalizeStringArray(row.rules),
  };
}
