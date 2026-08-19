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

  return { rows: parsed.rules as T[], generatedAt: parsed.generatedAt, missing: false };
}