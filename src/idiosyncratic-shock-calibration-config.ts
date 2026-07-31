import { readFileSync } from "fs";
import { load } from "js-yaml";
import {
  SHOCK_SCORE_KEYS,
  totalShockScore,
  type ShockDimensionScores,
  type ShockScoreKey,
} from "./idiosyncratic-shock.js";
import {
  GLOBAL_DEFAULT_SHOCK_THRESHOLD,
  buildShockCalibrationReadiness,
  buildShockCalibrationReadinessAtLevel,
  type ShockCalibrationLevel,
  type ShockCalibrationObservation,
  type ShockCalibrationReadiness,
} from "./idiosyncratic-shock-calibration.js";
import { inferShockJurisdictionGroup, normalizeShockCountry, type ShockJurisdictionGroup } from "./idiosyncratic-shock-jurisdiction.js";
import type { ShockMarket } from "./idiosyncratic-shock-market.js";

export type LocalShockScoreMethod = "global_structural" | "weighted_dimensions";

export type ValidatedLocalShockThreshold = {
  id: string;
  modelLevel: Exclude<ShockCalibrationLevel, "global">;
  country?: string | null;
  market?: ShockMarket | null;
  jurisdictionGroup?: ShockJurisdictionGroup | null;
  category?: string | null;
  scoreMethod: LocalShockScoreMethod;
  dimensionWeights?: Record<ShockScoreKey, number> | null;
  threshold: number;
  trainFrom: string;
  trainThrough: string;
  validationFrom: string;
  validationThrough: string;
  trainCases: number;
  validationCases: number;
  benchmarkMetric: "calibrationSignalBenchmarkRelative3m";
  evidenceNote: string;
};

export type ShockCalibrationConfig = {
  version: number;
  description?: string;
  globalDefaultThreshold: number;
  validatedLocalThresholds: ValidatedLocalShockThreshold[];
};

export type ResolvedShockCalibration = {
  readiness: ShockCalibrationReadiness;
  registryEntry: ValidatedLocalShockThreshold | null;
};

const DEFAULT_PATH = "config/idiosyncratic-shock-calibration.yml";
const REQUIRED_BENCHMARK_METRIC = "calibrationSignalBenchmarkRelative3m" as const;

function isoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateDimensionWeights(row: ValidatedLocalShockThreshold): void {
  if (row.scoreMethod === "global_structural") {
    if (row.dimensionWeights != null) throw new Error(`${row.id}: global_structural must not define dimensionWeights`);
    return;
  }
  const weights = row.dimensionWeights;
  if (!weights || typeof weights !== "object") throw new Error(`${row.id}: weighted_dimensions requires dimensionWeights`);
  const raw = weights as Partial<Record<ShockScoreKey, number>>;
  for (const key of SHOCK_SCORE_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.25 || value > 4) {
      throw new Error(`${row.id}: dimensionWeights.${key} must be within 0.25..4`);
    }
  }
  const unexpected = Object.keys(weights).filter(key => !SHOCK_SCORE_KEYS.includes(key as ShockScoreKey));
  if (unexpected.length > 0) throw new Error(`${row.id}: unexpected dimensionWeights keys=${unexpected.join(",")}`);
}

export function validateShockCalibrationConfig(config: ShockCalibrationConfig): void {
  if (config.version !== 1) throw new Error(`unsupported shock calibration config version=${config.version}`);
  if (config.globalDefaultThreshold !== GLOBAL_DEFAULT_SHOCK_THRESHOLD) {
    throw new Error(`globalDefaultThreshold=${config.globalDefaultThreshold} must match code default=${GLOBAL_DEFAULT_SHOCK_THRESHOLD}`);
  }
  if (!Array.isArray(config.validatedLocalThresholds)) throw new Error("validatedLocalThresholds must be an array");

  const ids = new Set<string>();
  for (const row of config.validatedLocalThresholds) {
    if (!row.id?.trim()) throw new Error("validated local threshold id is required");
    if (ids.has(row.id)) throw new Error(`duplicate validated local threshold id=${row.id}`);
    ids.add(row.id);
    if (row.scoreMethod !== "global_structural" && row.scoreMethod !== "weighted_dimensions") {
      throw new Error(`${row.id}: invalid scoreMethod=${String(row.scoreMethod)}`);
    }
    validateDimensionWeights(row);
    if (!Number.isFinite(row.threshold) || row.threshold < 0 || row.threshold > 20) {
      throw new Error(`${row.id}: threshold must be within 0..20`);
    }
    if (!isoDate(row.trainFrom) || !isoDate(row.trainThrough) || !isoDate(row.validationFrom) || !isoDate(row.validationThrough)) {
      throw new Error(`${row.id}: train/validation dates must be YYYY-MM-DD`);
    }
    if (!(row.trainFrom <= row.trainThrough && row.trainThrough < row.validationFrom && row.validationFrom <= row.validationThrough)) {
      throw new Error(`${row.id}: require trainFrom <= trainThrough < validationFrom <= validationThrough`);
    }
    if (!Number.isInteger(row.trainCases) || row.trainCases < 18) throw new Error(`${row.id}: trainCases must be >= 18`);
    if (!Number.isInteger(row.validationCases) || row.validationCases < 8) throw new Error(`${row.id}: validationCases must be >= 8`);
    if (row.benchmarkMetric !== REQUIRED_BENCHMARK_METRIC) throw new Error(`${row.id}: benchmarkMetric must be ${REQUIRED_BENCHMARK_METRIC}`);
    if (!row.evidenceNote?.trim()) throw new Error(`${row.id}: evidenceNote is required`);

    const country = normalizeShockCountry(row.country ?? null, row.market ?? null);
    const inferredGroup = inferShockJurisdictionGroup({ country, market: row.market ?? null });
    if (row.jurisdictionGroup && row.jurisdictionGroup !== inferredGroup && row.modelLevel !== "jurisdiction_group") {
      throw new Error(`${row.id}: jurisdictionGroup=${row.jurisdictionGroup} conflicts with country/market group=${inferredGroup}`);
    }
    if (row.modelLevel === "country" && !country) throw new Error(`${row.id}: country model requires country`);
    if (row.modelLevel === "country_category" && (!country || !row.category?.trim())) {
      throw new Error(`${row.id}: country_category model requires country and category`);
    }
    if (row.modelLevel === "jurisdiction_group" && !row.jurisdictionGroup) {
      throw new Error(`${row.id}: jurisdiction_group model requires jurisdictionGroup`);
    }
  }
}

export function loadShockCalibrationConfig(path = DEFAULT_PATH): ShockCalibrationConfig {
  const config = load(readFileSync(path, "utf-8")) as ShockCalibrationConfig;
  validateShockCalibrationConfig(config);
  return config;
}

export function findValidatedLocalThreshold(
  config: ShockCalibrationConfig,
  input: { modelLevel: ShockCalibrationLevel; country?: string | null; market?: ShockMarket | null; category?: string | null; jurisdictionGroup?: ShockJurisdictionGroup | null },
): ValidatedLocalShockThreshold | null {
  if (input.modelLevel === "global") return null;
  const country = normalizeShockCountry(input.country ?? null, input.market ?? null);
  const group = input.jurisdictionGroup ?? inferShockJurisdictionGroup({ country, market: input.market ?? null });
  const candidates = config.validatedLocalThresholds.filter(row => {
    if (row.modelLevel !== input.modelLevel) return false;
    if (row.modelLevel === "jurisdiction_group") return row.jurisdictionGroup === group;
    const rowCountry = normalizeShockCountry(row.country ?? null, row.market ?? null);
    if (rowCountry !== country) return false;
    if (row.modelLevel === "country_category") return row.category === input.category;
    return true;
  });
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.validationThrough.localeCompare(a.validationThrough) || b.id.localeCompare(a.id))[0];
}

function parentLevels(level: ShockCalibrationLevel): Array<Exclude<ShockCalibrationLevel, "global">> {
  if (level === "country_category") return ["country_category", "country", "jurisdiction_group"];
  if (level === "country") return ["country", "jurisdiction_group"];
  if (level === "jurisdiction_group") return ["jurisdiction_group"];
  return [];
}

export function resolveShockCalibration(
  config: ShockCalibrationConfig,
  input: {
    country?: string | null;
    market?: ShockMarket | null;
    category?: string | null;
    observations: ShockCalibrationObservation[];
  },
): ResolvedShockCalibration {
  const preliminary = buildShockCalibrationReadiness(input);

  // 最深のvalidated childを優先。ただしchildが未登録/古い場合はvalidated parentを使い続ける。
  for (const modelLevel of parentLevels(preliminary.modelLevel)) {
    const registryEntry = findValidatedLocalThreshold(config, {
      modelLevel,
      country: preliminary.country,
      market: preliminary.market,
      category: preliminary.category,
      jurisdictionGroup: preliminary.jurisdictionGroup,
    });
    if (!registryEntry) continue;

    const readiness = buildShockCalibrationReadinessAtLevel({
      modelLevel,
      country: preliminary.country,
      market: preliminary.market,
      category: preliminary.category,
      observations: input.observations,
      validatedThreshold: registryEntry.threshold,
    });
    if (readiness.status === "validated") {
      if (modelLevel !== preliminary.modelLevel) {
        readiness.notes.push(`deeper level=${preliminary.modelLevel} is not validated; using validated parent=${modelLevel}`);
      }
      return { readiness, registryEntry };
    }
  }

  return { readiness: preliminary, registryEntry: null };
}

export function computeLocalOpportunityScore(
  scores: ShockDimensionScores,
  registryEntry: ValidatedLocalShockThreshold | null,
): number {
  if (!registryEntry || registryEntry.scoreMethod === "global_structural") return totalShockScore(scores);
  const weights = registryEntry.dimensionWeights!;
  let weighted = 0;
  let weightSum = 0;
  for (const key of SHOCK_SCORE_KEYS) {
    const weight = weights[key];
    weighted += scores[key] * weight;
    weightSum += weight;
  }
  if (!(weightSum > 0)) return totalShockScore(scores);
  return Number(((weighted * 10) / weightSum).toFixed(2));
}
