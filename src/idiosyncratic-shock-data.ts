import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import {
  SHOCK_SCORE_KEYS,
  assertHistoricalCaseIntegrity,
  labelShockScore,
  totalShockScore,
  type HistoricalShockCase,
  type ShockActorType,
  type ShockDimensionScores,
  type ShockEvidenceStatus,
  type ShockPriceState,
  type ShockSource,
} from "./idiosyncratic-shock.js";

type CompactHistoricalCase = {
  id: string;
  company: string;
  ticker?: string | null;
  country: string;
  eventDate: string;
  checkpoint: string;
  category: string;
  actorType: ShockActorType;
  scoreVector: number[];
  priceState: ShockPriceState;
  summary: string;
  source: string;
  sourceType: ShockSource["sourceType"];
  outcomePattern: "fast" | "gradual" | "mixed" | "failed" | "unknown";
  lesson: string;
  confidence: "high" | "medium" | "low";
};

type HistoricalFile = {
  version: number;
  generatedAt: string;
  description: string;
  scoreOrder: string[];
  cases: CompactHistoricalCase[];
};

export type ActiveShockConfig = {
  version: number;
  description?: string;
  candidates: Array<{
    id: string;
    code?: string | null;
    company: string;
    detectedAt: string;
    category: string;
    actorType: ShockActorType;
    eventSummary: string;
    macroPrimaryCause: boolean;
    evidenceStatus: ShockEvidenceStatus;
    priceStateOverride?: ShockPriceState;
    priceStateCheckedAt?: string | null;
    scores: ShockDimensionScores;
    criticalLicenseOrDelistingRisk?: boolean;
    sources?: ShockSource[];
  }>;
};

function defaultHistoricalPaths(): string[] {
  const base = "data/idiosyncratic_shock_cases.yml";
  const dataDir = "data";
  const expansions = existsSync(dataDir)
    ? readdirSync(dataDir)
      .filter(name => /^idiosyncratic_shock_cases_expansion_\d+\.yml$/.test(name))
      .sort()
      .map(name => join(dataDir, name))
    : [];
  return [base, ...expansions].filter(existsSync);
}

function vectorToScores(vector: number[]): ShockDimensionScores {
  if (vector.length !== SHOCK_SCORE_KEYS.length) {
    throw new Error(`scoreVector length=${vector.length}; expected ${SHOCK_SCORE_KEYS.length}`);
  }
  const result = {} as ShockDimensionScores;
  SHOCK_SCORE_KEYS.forEach((key, index) => {
    const value = vector[index];
    if (value !== 0 && value !== 1 && value !== 2) {
      throw new Error(`invalid scoreVector ${key}=${String(value)}`);
    }
    result[key] = value;
  });
  return result;
}

function loadHistoricalFile(path: string): HistoricalShockCase[] {
  const raw = load(readFileSync(path, "utf-8")) as HistoricalFile;
  if (!Array.isArray(raw.cases)) throw new Error(`${path}: cases is required`);
  if (raw.scoreOrder.join("|") !== SHOCK_SCORE_KEYS.join("|")) {
    throw new Error(`${path}: scoreOrder does not match SHOCK_SCORE_KEYS`);
  }

  return raw.cases.map(item => {
    const scores = vectorToScores(item.scoreVector);
    const score = totalShockScore(scores);
    const result: HistoricalShockCase = {
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      eventDate: item.eventDate,
      decisionCheckpoint: item.checkpoint,
      category: item.category,
      actorType: item.actorType,
      eventSummary: item.summary,
      macroPrimaryCause: false,
      evidenceStatus: "confirmed",
      priceStateAtCheckpoint: item.priceState,
      scores,
      score,
      label: labelShockScore(score),
      scoringNotes: {},
      sources: [{ title: `${item.company} source`, url: item.source, sourceType: item.sourceType }],
      outcome: {
        summary: item.lesson,
        recoveryPattern: item.outcomePattern,
      },
      researchConfidence: item.confidence,
    };
    assertHistoricalCaseIntegrity(result);
    return result;
  });
}

export function loadHistoricalShockCases(path?: string): HistoricalShockCase[] {
  const paths = path ? [path] : defaultHistoricalPaths();
  const rows = paths.flatMap(loadHistoricalFile);
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`duplicate historical shock id: ${row.id}`);
    ids.add(row.id);
  }
  return rows;
}

export function loadActiveShockConfig(path = "config/idiosyncratic-shock-active.yml"): ActiveShockConfig {
  const raw = load(readFileSync(path, "utf-8")) as ActiveShockConfig;
  if (!Array.isArray(raw.candidates)) throw new Error(`${path}: candidates is required`);
  for (const candidate of raw.candidates) totalShockScore(candidate.scores);
  return raw;
}
