import { existsSync, readFileSync } from "fs";
import { addDaysJst, todayJst } from "./date.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isOptionalFiniteNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value));
}

export type ProValuationGeneratedRule = {
  code: string;
  name: string;
  risks?: string[];
  evidenceNeeded?: string[];
  priceSignal?: { relativeTopix20dPct?: number | null; change20dPct?: number | null; volumeSpikeRatio?: number | null };
};

export function isProValuationGeneratedRule(value: unknown): value is ProValuationGeneratedRule {
  if (!isRecord(value) || !isCanonicalText(value.code) || !isCanonicalText(value.name)) return false;
  if (value.risks !== undefined && !isStringArray(value.risks)) return false;
  if (value.evidenceNeeded !== undefined && !isStringArray(value.evidenceNeeded)) return false;
  if (value.priceSignal === undefined) return true;
  if (!isRecord(value.priceSignal)) return false;
  return isOptionalFiniteNumber(value.priceSignal.relativeTopix20dPct)
    && isOptionalFiniteNumber(value.priceSignal.change20dPct)
    && isOptionalFiniteNumber(value.priceSignal.volumeSpikeRatio);
}

export type GeneratedCompanyRulesLoad<T> = {
  rows: T[];
  generatedAt: string | null;
  missing: boolean;
};

export function readGeneratedCompanyRules<T>(
  path = "data/generated_company_rules_latest.json",
  asOf = todayJst(),
  isRow?: (value: unknown) => value is T,
): GeneratedCompanyRulesLoad<T> {
  if (!existsSync(path)) return { rows: [], generatedAt: null, missing: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    throw new Error(`${path}: generated company rules must contain valid JSON`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${path}: generated company rules root must be an object`);
  }
  if (!Array.isArray(parsed.rules)) {
    throw new Error(`${path}: generated company rules.rules must be an array`);
  }
  if (typeof parsed.generatedAt !== "string" || !isRealJstDate(parsed.generatedAt)) {
    throw new Error(`${path}: generated company rules.generatedAt must be a real Gregorian JST date`);
  }
  if (parsed.generatedAt > asOf) {
    throw new Error(`${path}: generated company rules.generatedAt must not be later than Pro valuation as-of date ${asOf}`);
  }
  if (isRow && parsed.rules.some(rule => !isRow(rule))) {
    throw new Error(`${path}: generated company rules.rules contains an invalid row`);
  }

  const seenCodes = new Set<string>();
  for (const rule of parsed.rules) {
    if (!isRecord(rule) || !isCanonicalText(rule.code)) continue;
    if (seenCodes.has(rule.code)) {
      throw new Error(`${path}: generated company rules.rules contains duplicate code ${rule.code}`);
    }
    seenCodes.add(rule.code);
  }

  return { rows: parsed.rules as T[], generatedAt: parsed.generatedAt, missing: false };
}