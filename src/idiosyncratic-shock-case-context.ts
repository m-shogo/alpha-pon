import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";
import type {
  ShockIncidentScope,
  ShockRecurrenceStatus,
  ShockStakeholder,
} from "./idiosyncratic-shock-context.js";

export type HistoricalShockCaseContext = {
  incidentCountry?: string | null;
  sector?: string | null;
  stakeholder?: ShockStakeholder | null;
  incidentScope?: ShockIncidentScope | null;
  recurrenceStatus?: ShockRecurrenceStatus | null;
  notes?: string | null;
};

type ContextFile = {
  version: number;
  generatedAt: string;
  description?: string;
  cases: Record<string, HistoricalShockCaseContext>;
};

const DEFAULT_PATH = "data/idiosyncratic_shock_case_context.yml";

export function loadHistoricalShockCaseContext(
  path = DEFAULT_PATH,
): Map<string, HistoricalShockCaseContext> {
  if (!existsSync(path)) return new Map();
  const raw = load(readFileSync(path, "utf-8")) as ContextFile;
  if (!raw || typeof raw !== "object" || !raw.cases || typeof raw.cases !== "object") {
    throw new Error(`${path}: cases object is required`);
  }
  return new Map(Object.entries(raw.cases));
}
