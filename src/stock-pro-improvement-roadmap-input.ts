export type RoadmapEvidenceCount = {
  valid: boolean;
  count: number;
};

function parseNonNegativeIntegerLine(text: string, label: string): number | null {
  const prefix = `- ${label}: `;
  const matches = text
    .split("\n")
    .filter(line => line.startsWith(prefix));
  if (matches.length !== 1) return null;
  const raw = matches[0]!.slice(prefix.length).trim();
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export function countOnboardingUnknownThinEvidence(text: string): RoadmapEvidenceCount {
  const header = "| coverage | code | name | category | missing | advice |";
  if (!text.split("\n").some(line => line.trim() === header)) {
    return { valid: false, count: 0 };
  }

  const count = text
    .split("\n")
    .filter(line => /^\|\s*unknown_or_thin\s*\|/.test(line))
    .length;
  return { valid: true, count };
}

export function countCompanyCoverageWarnings(text: string): RoadmapEvidenceCount {
  const hypothesisMissingNetwork = parseNonNegativeIntegerLine(text, "hypothesis missing network");
  const networkMissingHypothesis = parseNonNegativeIntegerLine(text, "network missing hypothesis");
  if (hypothesisMissingNetwork === null || networkMissingHypothesis === null) {
    return { valid: false, count: 0 };
  }
  return {
    valid: true,
    count: hypothesisMissingNetwork + networkMissingHypothesis,
  };
}
