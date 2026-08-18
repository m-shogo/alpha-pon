import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { addDaysJst, todayJst } from "./date.js";

export type PeriodicScoreLogEntry = {
  code: string;
  name: string;
  priority?: string;
  tags?: string[];
  rules?: string[];
  score: number;
  alertLevel: string;
  warnings?: string[];
  negativeReasons?: string[];
  createdAt: string;
  expertReview?: { finalVerdict: string; consensusScore: number };
  riskReview?: { decision: string; blockers: string[] };
};

export type ParsedPeriodicScoreLog = {
  entries: PeriodicScoreLogEntry[];
  invalidRows: number[];
};

export type PeriodicScoreInput = {
  entries: PeriodicScoreLogEntry[];
  invalidFiles: string[];
  invalidRows: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isRealDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function normalizePeriodicScoreRow(value: unknown, expectedDate?: string): PeriodicScoreLogEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.code !== "string" || row.code.trim() === "") return null;
  if (typeof row.name !== "string" || row.name.trim() === "") return null;
  if (typeof row.score !== "number" || !Number.isFinite(row.score)) return null;
  if (typeof row.alertLevel !== "string" || row.alertLevel.trim() === "") return null;
  if (typeof row.createdAt !== "string" || !isRealDate(row.createdAt)) return null;
  if (expectedDate != null && row.createdAt !== expectedDate) return null;

  for (const field of ["tags", "rules", "warnings", "negativeReasons"] as const) {
    if (row[field] != null && !isStringArray(row[field])) return null;
  }

  let expertReview: PeriodicScoreLogEntry["expertReview"];
  if (row.expertReview != null) {
    if (!row.expertReview || typeof row.expertReview !== "object" || Array.isArray(row.expertReview)) return null;
    const expert = row.expertReview as Record<string, unknown>;
    if (typeof expert.finalVerdict !== "string") return null;
    if (typeof expert.consensusScore !== "number" || !Number.isFinite(expert.consensusScore)) return null;
    expertReview = { finalVerdict: expert.finalVerdict, consensusScore: expert.consensusScore };
  }

  let riskReview: PeriodicScoreLogEntry["riskReview"];
  if (row.riskReview != null) {
    if (!row.riskReview || typeof row.riskReview !== "object" || Array.isArray(row.riskReview)) return null;
    const risk = row.riskReview as Record<string, unknown>;
    if (typeof risk.decision !== "string" || !isStringArray(risk.blockers)) return null;
    riskReview = { decision: risk.decision, blockers: risk.blockers };
  }

  return {
    code: row.code,
    name: row.name,
    priority: typeof row.priority === "string" ? row.priority : undefined,
    tags: row.tags as string[] | undefined,
    rules: row.rules as string[] | undefined,
    score: row.score,
    alertLevel: row.alertLevel,
    warnings: row.warnings as string[] | undefined,
    negativeReasons: row.negativeReasons as string[] | undefined,
    createdAt: row.createdAt,
    expertReview,
    riskReview,
  };
}

export function parsePeriodicScoreLog(raw: string, expectedDate?: string): ParsedPeriodicScoreLog | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const entries: PeriodicScoreLogEntry[] = [];
    const invalidRows: number[] = [];
    parsed.forEach((value, index) => {
      const normalized = normalizePeriodicScoreRow(value, expectedDate);
      if (normalized) entries.push(normalized);
      else invalidRows.push(index + 1);
    });
    return { entries, invalidRows };
  } catch {
    return null;
  }
}

export function loadPeriodicScoreLogs(reportDir = "reports", asOf = todayJst()): PeriodicScoreInput {
  if (!existsSync(reportDir)) return { entries: [], invalidFiles: [], invalidRows: [] };

  const entries: PeriodicScoreLogEntry[] = [];
  const invalidFiles: string[] = [];
  const invalidRows: string[] = [];
  const files = readdirSync(reportDir)
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  for (const file of files) {
    const snapshotDate = file.slice("scores_".length, -".json".length);
    if (!isRealDate(snapshotDate) || snapshotDate > asOf) {
      invalidFiles.push(file);
      continue;
    }

    let raw: string;
    try {
      raw = readFileSync(join(reportDir, file), "utf-8");
    } catch {
      invalidFiles.push(file);
      continue;
    }

    const parsed = parsePeriodicScoreLog(raw, snapshotDate);
    if (!parsed) {
      invalidFiles.push(file);
      continue;
    }
    entries.push(...parsed.entries);
    invalidRows.push(...parsed.invalidRows.map(row => `${file}#row-${row}`));
  }

  return { entries, invalidFiles, invalidRows };
}
