import { addDaysJst } from "./date.js";

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
  alertLevel: string;
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

function normalizeRow(value: unknown): LearningScoreEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.code !== "string" || value.code.trim() === "" || value.code !== value.code.trim()) return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  if (typeof value.score !== "number" || !Number.isFinite(value.score)) return null;
  if (typeof value.alertLevel !== "string") return null;
  if (typeof value.createdAt !== "string" || !isRealJstDate(value.createdAt)) return null;

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
    if (typeof value.riskReview.decision !== "string" || !isOptionalStringArray(value.riskReview.blockers)) return null;
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

export function parseLearningScoreInput(raw: string): ParsedLearningScoreInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const entries: LearningScoreEntry[] = [];
  const invalidRows: number[] = [];
  parsed.forEach((value, index) => {
    const normalized = normalizeRow(value);
    if (normalized) entries.push(normalized);
    else invalidRows.push(index + 1);
  });
  return { entries, invalidRows };
}
