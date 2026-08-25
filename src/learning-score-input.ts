import { addDaysJst, todayJst } from "./date.js";
import type { AlertLevel } from "./types.js";

export type LearningExpertLens = {
  name: string;
  verdict: string;
  nextChecks: string[];
};

export type LearningScoreEntry = {
  code: string;
  name: string;
  priority?: string;
  tags?: string[];
  rules?: string[];
  score: number;
  alertLevel: AlertLevel;
  reasons?: string[];
  negativeReasons?: string[];
  warnings?: string[];
  dataQuality?: string;
  hypeRisk?: { reasons: string[] };
  riskReview?: { decision: string; blockers: string[] };
  expertReview?: {
    finalVerdict: string;
    lenses: LearningExpertLens[];
    disagreements: string[];
  };
  createdAt: string;
};

export type ParsedLearningScoreInput = {
  entries: LearningScoreEntry[];
  invalidRows: number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isAlertLevel(value: unknown): value is AlertLevel {
  return value === "urgent" || value === "daily" || value === "log" || value === "ignore";
}

function isRiskDecision(value: unknown): value is "reject" | "research_only" | "watch" | "high_quality_candidate" {
  return value === "reject" || value === "research_only" || value === "watch" || value === "high_quality_candidate";
}

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function normalizeLens(value: unknown): LearningExpertLens | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  if (typeof value.verdict !== "string") return null;
  if (!isOptionalStringArray(value.nextChecks)) return null;
  return {
    name: value.name,
    verdict: value.verdict,
    nextChecks: (value.nextChecks as string[] | undefined) ?? [],
  };
}

function normalizeRow(value: unknown, asOf: string): LearningScoreEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.code !== "string" || value.code.trim() === "" || value.code !== value.code.trim()) return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  if (typeof value.score !== "number" || !Number.isFinite(value.score)) return null;
  if (!isAlertLevel(value.alertLevel)) return null;
  if (typeof value.createdAt !== "string" || !isRealJstDate(value.createdAt) || value.createdAt > asOf) return null;

  for (const field of ["tags", "rules", "reasons", "negativeReasons", "warnings"] as const) {
    if (!isOptionalStringArray(value[field])) return null;
  }

  let hypeRisk: LearningScoreEntry["hypeRisk"];
  if (value.hypeRisk !== undefined) {
    if (!isRecord(value.hypeRisk) || !isOptionalStringArray(value.hypeRisk.reasons)) return null;
    hypeRisk = { reasons: (value.hypeRisk.reasons as string[] | undefined) ?? [] };
  }

  let riskReview: LearningScoreEntry["riskReview"];
  if (value.riskReview !== undefined) {
    if (!isRecord(value.riskReview)) return null;
    if (!isRiskDecision(value.riskReview.decision) || !isOptionalStringArray(value.riskReview.blockers)) return null;
    riskReview = {
      decision: value.riskReview.decision,
      blockers: (value.riskReview.blockers as string[] | undefined) ?? [],
    };
  }

  let expertReview: LearningScoreEntry["expertReview"];
  if (value.expertReview !== undefined) {
    if (!isRecord(value.expertReview)) return null;
    if (typeof value.expertReview.finalVerdict !== "string") return null;
    if (!isOptionalStringArray(value.expertReview.disagreements)) return null;
    if (!Array.isArray(value.expertReview.lenses)) return null;
    const lenses = value.expertReview.lenses.map(normalizeLens);
    if (lenses.some(lens => lens === null)) return null;
    expertReview = {
      finalVerdict: value.expertReview.finalVerdict,
      lenses: lenses as LearningExpertLens[],
      disagreements: (value.expertReview.disagreements as string[] | undefined) ?? [],
    };
  }

  return {
    code: value.code,
    name: value.name,
    priority: typeof value.priority === "string" ? value.priority : undefined,
    tags: value.tags as string[] | undefined,
    rules: value.rules as string[] | undefined,
    score: value.score,
    alertLevel: value.alertLevel,
    reasons: value.reasons as string[] | undefined,
    negativeReasons: value.negativeReasons as string[] | undefined,
    warnings: value.warnings as string[] | undefined,
    dataQuality: typeof value.dataQuality === "string" ? value.dataQuality : undefined,
    hypeRisk,
    riskReview,
    expertReview,
    createdAt: value.createdAt,
  };
}

export function parseLearningScoreInput(raw: string, asOf = todayJst()): ParsedLearningScoreInput | null {
  if (!isRealJstDate(asOf)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const candidates: Array<{ entry: LearningScoreEntry; row: number }> = [];
  const invalidRows: number[] = [];
  parsed.forEach((value, index) => {
    const normalized = normalizeRow(value, asOf);
    if (normalized) candidates.push({ entry: normalized, row: index + 1 });
    else invalidRows.push(index + 1);
  });

  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = `${candidate.entry.createdAt}_${candidate.entry.code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const entries: LearningScoreEntry[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.entry.createdAt}_${candidate.entry.code}`;
    if ((counts.get(key) ?? 0) > 1) invalidRows.push(candidate.row);
    else entries.push(candidate.entry);
  }

  invalidRows.sort((left, right) => left - right);
  return { entries, invalidRows };
}
