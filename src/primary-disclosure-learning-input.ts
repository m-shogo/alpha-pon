import { addDaysJst, todayJst } from "./date.js";

export type PrimaryDecision = "confirmed" | "caution" | "block" | "missing" | "unknown_or_legacy";

export type PrimaryDisclosureLearningItem = {
  source: string;
  title: string;
  category: string;
  severity: string;
  publishedAt: string;
};

export type PrimaryDisclosureLearningScore = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  createdAt: string;
  primaryDisclosureReview?: {
    decision?: PrimaryDecision;
    items?: PrimaryDisclosureLearningItem[];
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

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function scoreSourceDate(source: string): string | null {
  return /(?:^|\/)scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(source)?.[1] ?? null;
}

function jstDateList(value: unknown, label: string, warnings: string[], asOf: string): string[] {
  const values = stringList(value, label, warnings);
  return values.filter((item) => {
    const valid = isRealJstDate(item) && item <= asOf;
    if (!valid) warnings.push(`${label}: invalid_date`);
    return valid;
  });
}

function provenanceCount(value: unknown, label: string, warnings: string[]): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  warnings.push(`${label}: invalid_count`);
  return undefined;
}

function disclosureItems(value: unknown, label: string, warnings: string[], asOf: string): PrimaryDisclosureLearningItem[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${label}: invalid_list`);
    return [];
  }
  const items: PrimaryDisclosureLearningItem[] = [];
  value.forEach((item, index) => {
    const itemLabel = `${label} item ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      warnings.push(`${itemLabel}: invalid_row`);
      return;
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.source !== "string" || row.source.trim() === "" ||
      typeof row.title !== "string" || row.title.trim() === "" ||
      typeof row.category !== "string" || row.category.trim() === "" ||
      typeof row.severity !== "string" || row.severity.trim() === "" ||
      typeof row.publishedAt !== "string" || !isRealJstDate(row.publishedAt) || row.publishedAt > asOf
    ) {
      warnings.push(`${itemLabel}: invalid_fields`);
      return;
    }
    items.push({
      source: row.source,
      title: row.title,
      category: row.category,
      severity: row.severity,
      publishedAt: row.publishedAt,
    });
  });
  return items;
}

export function normalizePrimaryDisclosureLearningScoreInput(
  input: unknown,
  source = "scores",
  asOf = todayJst(),
): PrimaryDisclosureLearningScoreInput {
  const sourceDate = scoreSourceDate(source);
  if (sourceDate && (!isRealJstDate(sourceDate) || !isRealJstDate(asOf) || sourceDate > asOf)) {
    return { rows: [], warnings: [`${source}: invalid_source_date`] };
  }
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
    if (
      typeof row.alertLevel !== "string" ||
      typeof row.createdAt !== "string" ||
      !isRealJstDate(row.createdAt) ||
      !isRealJstDate(asOf) ||
      row.createdAt > asOf ||
      (sourceDate != null && row.createdAt !== sourceDate)
    ) {
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
              tdnetCount: provenanceCount(coverage.tdnetCount, `${label}.primaryDisclosureReview.sourceCoverage.tdnetCount`, warnings),
              edinetCount: provenanceCount(coverage.edinetCount, `${label}.primaryDisclosureReview.sourceCoverage.edinetCount`, warnings),
              fetchErrorCount: provenanceCount(coverage.fetchErrorCount, `${label}.primaryDisclosureReview.sourceCoverage.fetchErrorCount`, warnings),
              scannedEdinetDates: jstDateList(coverage.scannedEdinetDates, `${label}.primaryDisclosureReview.sourceCoverage.scannedEdinetDates`, warnings, asOf),
            };
          }
        }

        primaryDisclosureReview = {
          decision,
          items: disclosureItems(review.items, `${label}.primaryDisclosureReview.items`, warnings, asOf),
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