// Historical context / reaction-anchor YAMLのtop-level envelope契約。
// case shapeだけでなくversion/generatedAt/casesを検証し、壊れたexpansionをfail-fastで検出する。

export type HistoricalContextEnvelope = {
  version: 1;
  generatedAt: string;
  description?: string;
  cases: Record<string, unknown>;
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: expected object`);
  return value as Record<string, unknown>;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateHistoricalContextEnvelope(
  value: unknown,
  label = "historical context envelope",
): HistoricalContextEnvelope {
  const row = objectValue(value, label);
  if (row.version !== 1) throw new Error(`${label}.version: expected 1, got ${String(row.version)}`);
  if (!validIsoDate(row.generatedAt)) throw new Error(`${label}.generatedAt: expected valid YYYY-MM-DD`);
  if (row.description != null && typeof row.description !== "string") {
    throw new Error(`${label}.description: expected string|null`);
  }
  if (!row.cases || typeof row.cases !== "object" || Array.isArray(row.cases)) {
    throw new Error(`${label}.cases: expected object`);
  }
  const cases = row.cases as Record<string, unknown>;
  for (const [id, item] of Object.entries(cases)) {
    if (!id.trim()) throw new Error(`${label}.cases: empty case id`);
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label}.cases.${id}: expected object`);
    }
  }
  return {
    version: 1,
    generatedAt: row.generatedAt as string,
    ...(row.description == null ? {} : { description: row.description as string }),
    cases,
  };
}
