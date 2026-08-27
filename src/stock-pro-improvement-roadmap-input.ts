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

const STALE_WARNING_ACTIONS = new Set([
  "retired",
  "stale",
  "retire_or_rewrite_repeated_miss",
  "review_repeated_miss",
  "missing_review_date",
  "retire_or_rewrite",
  "review_needed",
]);

export function countStaleHypothesisWarnings(text: string): RoadmapEvidenceCount {
  const lines = text.split("\n");
  const header = "| action | category | code | name | ageDays | misses | topReason | status |";
  const headerIndex = lines.findIndex(line => line.trim() === header);
  if (headerIndex < 0) return { valid: false, count: 0 };

  let count = 0;
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim() || line.startsWith("## ")) break;
    if (!line.trim().startsWith("|")) return { valid: false, count: 0 };
    const cells = line.split("|").map(cell => cell.trim()).filter(Boolean);
    const action = cells[0];
    if (action === "ok") continue;
    if (!action || !STALE_WARNING_ACTIONS.has(action)) return { valid: false, count: 0 };
    count += 1;
  }
  return { valid: true, count };
}

export function countRegimeAlignmentWarnings(text: string): RoadmapEvidenceCount {
  const lines = text.split("\n");
  const thinHeading = "## warning: active but thin";
  const cautionHeading = "## caution: inactive categories still carrying active companies";
  const ruleHeading = "## rule";
  const thinIndex = lines.findIndex(line => line.trim() === thinHeading);
  const cautionIndex = lines.findIndex(line => line.trim() === cautionHeading);
  const ruleIndex = lines.findIndex(line => line.trim() === ruleHeading);
  if (thinIndex < 0 || cautionIndex <= thinIndex || ruleIndex <= cautionIndex) {
    return { valid: false, count: 0 };
  }

  const thinLines = lines.slice(thinIndex + 1, cautionIndex).map(line => line.trim()).filter(Boolean);
  const noThinWarning = "- 監視対象なのに銘柄仮説が空のカテゴリはありません。";
  const thinEvidence = thinLines.filter(line => line !== noThinWarning);
  if (thinEvidence.some(line => !/^- .+: companies=0$/.test(line))) {
    return { valid: false, count: 0 };
  }

  const cautionLines = lines.slice(cautionIndex + 1, ruleIndex).map(line => line.trim()).filter(Boolean);
  const noInactiveWarning = "- current regime 外で active companies を持つカテゴリはありません。";
  const categoryHeadings = cautionLines.filter(line => line.startsWith("### "));
  if (categoryHeadings.length === 0) {
    if (cautionLines.length !== 1 || cautionLines[0] !== noInactiveWarning) {
      return { valid: false, count: 0 };
    }
  } else {
    const cautionEvidence = cautionLines.filter(line => line.startsWith("- caution: "));
    if (cautionEvidence.length !== categoryHeadings.length || cautionLines.includes(noInactiveWarning)) {
      return { valid: false, count: 0 };
    }
  }

  return { valid: true, count: thinEvidence.length + categoryHeadings.length };
}
