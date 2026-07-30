// 企業固有ショックの国別/地域別キャリブレーション。
// Global Structural Scoreは変更せず、十分なoutcomeが貯まった階層だけを将来Local Opportunityへ昇格させる。
// 少数標本で係数や閾値を最適化しない。必ず時系列holdoutを残し、足りなければ親モデルへ縮退する。

import type { HistoricalShockCase } from "./idiosyncratic-shock.js";
import { inferShockJurisdictionGroup, normalizeShockCountry, type ShockJurisdictionGroup } from "./idiosyncratic-shock-jurisdiction.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";
import type { ShockMarket } from "./idiosyncratic-shock-market.js";

export const GLOBAL_DEFAULT_SHOCK_THRESHOLD = 12;
export const MIN_COUNTRY_CASES = 30;
export const MIN_COUNTRY_CATEGORY_CASES = 20;
export const MIN_GROUP_CASES = 40;
export const MIN_VALIDATION_CASES = 8;
export const MIN_TRAIN_CASES = 18;

export type ShockCalibrationLevel = "global" | "jurisdiction_group" | "country" | "country_category";
export type ShockCalibrationStatus = "global_default" | "insufficient_data" | "ready_for_validation" | "validated";

export type ShockCalibrationObservation = {
  caseId: string;
  company: string;
  checkpoint: string;
  market: ShockMarket;
  country: string | null;
  jurisdictionGroup: ShockJurisdictionGroup;
  category: string;
  score: number;
  benchmarkRelative1m: number | null;
  benchmarkRelative3m: number | null;
  benchmarkRelative1y: number | null;
};

export type ShockCalibrationReadiness = {
  country: string | null;
  market: ShockMarket | null;
  category: string | null;
  jurisdictionGroup: ShockJurisdictionGroup;
  modelLevel: ShockCalibrationLevel;
  status: ShockCalibrationStatus;
  effectiveThreshold: number;
  effectiveThresholdSource: "global_default" | "validated_local";
  globalCases: number;
  groupCases: number;
  countryCases: number;
  countryCategoryCases: number;
  trainCases: number;
  validationCases: number;
  usableOutcomeCases: number;
  blockers: string[];
  notes: string[];
};

function usable3m(row: ShockCalibrationObservation): boolean {
  return typeof row.benchmarkRelative3m === "number" && Number.isFinite(row.benchmarkRelative3m);
}

export function enrichShockCalibrationObservations(
  records: ShockHistoricalOutcomeRecord[],
  historicalCases: HistoricalShockCase[],
): ShockCalibrationObservation[] {
  const historicalById = new Map(historicalCases.map(item => [item.id, item]));
  return records.map(record => {
    const historical = historicalById.get(record.caseId);
    const country = normalizeShockCountry(historical?.country ?? null, record.market);
    return {
      caseId: record.caseId,
      company: record.company,
      checkpoint: record.checkpoint,
      market: record.market,
      country,
      jurisdictionGroup: inferShockJurisdictionGroup({ country, market: record.market }),
      category: historical?.category ?? "unknown",
      score: record.score,
      benchmarkRelative1m: record.benchmarkRelative1m,
      benchmarkRelative3m: record.benchmarkRelative3m,
      benchmarkRelative1y: record.benchmarkRelative1y,
    };
  });
}

function chronologicalSplit(rows: ShockCalibrationObservation[]): {
  train: ShockCalibrationObservation[];
  validation: ShockCalibrationObservation[];
} {
  const sorted = [...rows].sort((a, b) => a.checkpoint.localeCompare(b.checkpoint) || a.caseId.localeCompare(b.caseId));
  if (sorted.length === 0) return { train: [], validation: [] };
  const validationCount = Math.max(MIN_VALIDATION_CASES, Math.ceil(sorted.length * 0.25));
  const splitAt = Math.max(0, sorted.length - validationCount);
  return { train: sorted.slice(0, splitAt), validation: sorted.slice(splitAt) };
}

export function buildShockCalibrationReadiness(input: {
  country?: string | null;
  market?: ShockMarket | null;
  category?: string | null;
  observations: ShockCalibrationObservation[];
  validatedThreshold?: number | null;
}): ShockCalibrationReadiness {
  const country = normalizeShockCountry(input.country, input.market ?? null);
  const group = inferShockJurisdictionGroup({ country, market: input.market ?? null });
  const category = input.category ?? null;
  const usable = input.observations.filter(usable3m);
  const groupRows = usable.filter(row => row.jurisdictionGroup === group);
  const countryRows = country == null ? [] : usable.filter(row => row.country === country);
  const countryCategoryRows = category == null ? [] : countryRows.filter(row => row.category === category);
  const blockers: string[] = [];
  const notes: string[] = [];

  let modelLevel: ShockCalibrationLevel = "global";
  let candidateRows = usable;
  let requiredCases = 0;

  if (countryCategoryRows.length >= MIN_COUNTRY_CATEGORY_CASES) {
    modelLevel = "country_category";
    candidateRows = countryCategoryRows;
    requiredCases = MIN_COUNTRY_CATEGORY_CASES;
  } else if (countryRows.length >= MIN_COUNTRY_CASES) {
    modelLevel = "country";
    candidateRows = countryRows;
    requiredCases = MIN_COUNTRY_CASES;
  } else if (groupRows.length >= MIN_GROUP_CASES) {
    modelLevel = "jurisdiction_group";
    candidateRows = groupRows;
    requiredCases = MIN_GROUP_CASES;
  } else {
    if (country && countryRows.length < MIN_COUNTRY_CASES) {
      blockers.push(`country sample ${countryRows.length} < ${MIN_COUNTRY_CASES}`);
    }
    if (category && countryCategoryRows.length < MIN_COUNTRY_CATEGORY_CASES) {
      blockers.push(`country-category sample ${countryCategoryRows.length} < ${MIN_COUNTRY_CATEGORY_CASES}`);
    }
    notes.push("local sample不足のためGlobal Structural Score + global default thresholdへ縮退");
  }

  const split = chronologicalSplit(candidateRows);
  const hasValidation = split.train.length >= MIN_TRAIN_CASES && split.validation.length >= MIN_VALIDATION_CASES;
  const validatedThreshold = input.validatedThreshold;

  let status: ShockCalibrationStatus = modelLevel === "global" ? "global_default" : "insufficient_data";
  let effectiveThreshold = GLOBAL_DEFAULT_SHOCK_THRESHOLD;
  let effectiveThresholdSource: ShockCalibrationReadiness["effectiveThresholdSource"] = "global_default";

  if (modelLevel !== "global") {
    if (!hasValidation) {
      blockers.push(`time holdout insufficient train=${split.train.length}/${MIN_TRAIN_CASES} validation=${split.validation.length}/${MIN_VALIDATION_CASES}`);
      notes.push(`階層${modelLevel}は母数${candidateRows.length}（最低${requiredCases}）を満たしても、out-of-sample検証が不足している間は昇格しない`);
      status = "insufficient_data";
    } else if (validatedThreshold == null || !Number.isFinite(validatedThreshold)) {
      status = "ready_for_validation";
      notes.push("時系列holdoutを確保できた。trainで候補閾値を作り、validationで確認するまで12点を維持する");
    } else {
      status = "validated";
      effectiveThreshold = validatedThreshold;
      effectiveThresholdSource = "validated_local";
      notes.push("検証済みlocal thresholdを使用。Global Structural Scoreそのものは変更しない");
    }
  }

  return {
    country,
    market: input.market ?? null,
    category,
    jurisdictionGroup: group,
    modelLevel,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    globalCases: usable.length,
    groupCases: groupRows.length,
    countryCases: countryRows.length,
    countryCategoryCases: countryCategoryRows.length,
    trainCases: split.train.length,
    validationCases: split.validation.length,
    usableOutcomeCases: candidateRows.length,
    blockers,
    notes,
  };
}

export function calibrationReadinessForCountries(
  observations: ShockCalibrationObservation[],
  countries: Array<{ country: string; market?: ShockMarket | null }>,
): ShockCalibrationReadiness[] {
  return countries.map(input => buildShockCalibrationReadiness({
    ...input,
    observations,
  }));
}
