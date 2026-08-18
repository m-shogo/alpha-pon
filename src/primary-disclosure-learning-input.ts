export type PrimaryDecision = "confirmed" | "caution" | "block" | "missing" | "unknown_or_legacy";

export type PrimaryDisclosureLearningScore = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  createdAt: string;
  primaryDisclosureReview?: {
    decision?: PrimaryDecision;
    sourceCoverage?: {
      tdnetCount?: number;
      edinetCount?: number;
      scannedEdinetDates?: string[];
      fetchErrorCount?: number;
    };
    positives?: string[];
    warnings?: string[];
    blockers?: string[];
  };
};

export type PrimaryDisclosureLearningScoreInput = {
  rows: PrimaryDisclosureLearningScore[];
  warnings: string[];
};

const DECISIONS = new Set<PrimaryDecision>([
  "confirmed",
  "caution",
  "block",
  "missing",
  "unknown_or_legacy",
]);

function stringList(value: unknown, label: string, warnings: string[]): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${label}: invalid_list`);
    return [];
  }
  return value.filter((item): item is string => {
    const valid = typeof item === "string" && item.trim().length > 0;
    if (!valid) warnings.push(`${label}: invalid_item`);
    return valid;
  });
}

export function normalizePrimaryDisclosureLearningScoreInput(
  input: unknown,
  source = "scores",
): PrimaryDisclosureLearningScoreInput {
  if (!Array.isArray(input)) {
    return { rows: [], warnings: [`${source}: invalid_root`] };
  }

  const rows: PrimaryDisclosureLearningScore[] = [];
  const warnings: string[] = [];

  input.forEach((value, index) => {
    const label = `${source} row ${index + 1}`;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      warnings.push(`${label}: invalid_row`);
      return;
    }
    const row = value as Record<string, unknown>;
    if (typeof row.code !== "string" || row.code.trim() === "" || row.code !== row.code.trim()) {
      warnings.push(`${label}: invalid_code`);
      return;
    }
    if (typeof row.name !== "string" || row.name.trim() === "") {
      warnings.push(`${label}: invalid_name`);
      return;
    }
    if (typeof row.score !== "number" || !Number.isFinite(row.score)) {
      warnings.push(`${label}: invalid_score`);
      return;
    }
    if (typeof row.alertLevel !== "string" || typeof row.createdAt !== "string") {
      warnings.push(`${label}: invalid_metadata`);
      return;
    }

    let primaryDisclosureReview: PrimaryDisclosureLearningScore["primaryDisclosureReview"];
    const rawReview = row.primaryDisclosureReview;
    if (rawReview != null) {
      if (!rawReview || typeof rawReview !== "object" || Array.isArray(rawReview)) {
        warnings.push(`${label}.primaryDisclosureReview: invalid_object`);
      } else {
        const review = rawReview as Record<string, unknown>;
        const decision = review.decision == null
          ? undefined
          : typeof review.decision === "string" && DECISIONS.has(review.decision as PrimaryDecision)
            ? review.decision as PrimaryDecision
            : undefined;
        if (review.decision != null && decision == null) warnings.push(`${label}.primaryDisclosureReview.decision: invalid_value`);

        let sourceCoverage: NonNullable<PrimaryDisclosureLearningScore["primaryDisclosureReview"]>["sourceCoverage"];
        if (review.sourceCoverage != null) {
          if (typeof review.sourceCoverage !== "object" || Array.isArray(review.sourceCoverage)) {
            warnings.push(`${label}.primaryDisclosureReview.sourceCoverage: invalid_object`);
          } else {
            const coverage = review.sourceCoverage as Record<string, unknown>;
            sourceCoverage = {
              tdnetCount: typeof coverage.tdnetCount === "number" && Number.isFinite(coverage.tdnetCount) ? coverage.tdnetCount : undefined,
              edinetCount: typeof coverage.edinetCount === "number" && Number.isFinite(coverage.edinetCount) ? coverage.edinetCount : undefined,
              fetchErrorCount: typeof coverage.fetchErrorCount === "number" && Number.isFinite(coverage.fetchErrorCount) ? coverage.fetchErrorCount : undefined,
              scannedEdinetDates: stringList(coverage.scannedEdinetDates, `${label}.primaryDisclosureReview.sourceCoverage.scannedEdinetDates`, warnings),
            };
          }
        }

        primaryDisclosureReview = {
          decision,
          sourceCoverage,
          positives: stringList(review.positives, `${label}.primaryDisclosureReview.positives`, warnings),
          warnings: stringList(review.warnings, `${label}.primaryDisclosureReview.warnings`, warnings),
          blockers: stringList(review.blockers, `${label}.primaryDisclosureReview.blockers`, warnings),
        };
      }
    }

    rows.push({
      code: row.code,
      name: row.name,
      score: row.score,
      alertLevel: row.alertLevel,
      createdAt: row.createdAt,
      primaryDisclosureReview,
    });
  });

  return { rows, warnings };
}
