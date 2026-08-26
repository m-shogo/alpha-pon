type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value ? value : null;
}

function canonicalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every(item => canonicalString(item) !== null)) return null;
  return value as string[];
}

export type RegimeScenarioConfigRow = {
  label: string;
  description: string;
  watch_themes: string[];
  avoid_or_caution: string[];
  non_move_reasons: string[];
  evidence_checks: string[];
};

export function normalizeRegimeScenarioConfig(value: unknown): {
  scenarios: Record<string, RegimeScenarioConfigRow>;
  warnings: string[];
} {
  if (!isRecord(value) || !isRecord(value.scenarios)) {
    return { scenarios: {}, warnings: ["regime-scenarios.yml root/scenarios shape is invalid"] };
  }

  const scenarios: Record<string, RegimeScenarioConfigRow> = {};
  const warnings: string[] = [];
  for (const [rawId, rawScenario] of Object.entries(value.scenarios)) {
    const id = canonicalString(rawId);
    if (!id || !isRecord(rawScenario)) {
      warnings.push(`regime-scenarios.yml scenario ${rawId} shape or identity is invalid`);
      continue;
    }
    const label = canonicalString(rawScenario.label);
    const description = canonicalString(rawScenario.description);
    const watchThemes = canonicalStringArray(rawScenario.watch_themes);
    const avoidOrCaution = canonicalStringArray(rawScenario.avoid_or_caution);
    const nonMoveReasons = canonicalStringArray(rawScenario.non_move_reasons);
    const evidenceChecks = canonicalStringArray(rawScenario.evidence_checks);
    if (!label || !description || !watchThemes || !avoidOrCaution || !nonMoveReasons || !evidenceChecks) {
      warnings.push(`regime-scenarios.yml scenario ${id} fields are invalid`);
      continue;
    }
    scenarios[id] = {
      label,
      description,
      watch_themes: watchThemes,
      avoid_or_caution: avoidOrCaution,
      non_move_reasons: nonMoveReasons,
      evidence_checks: evidenceChecks,
    };
  }

  return { scenarios, warnings };
}
