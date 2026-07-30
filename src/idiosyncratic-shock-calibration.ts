// 企業固有ショックの国別/地域別キャリブレーション。
// Global Structural Scoreは変更せず、十分なoutcomeが貯まった階層だけを将来Local Opportunityへ昇格させる。
// 少数標本で係数や閾値を最適化しない。必ず時系列holdoutを残し、足りなければ親モデルへ縮退する。
// 戦略成績の正本はdecision checkpointではなく、非価格hard gate confirmed_pass後のFirst Eligible Signal起点。

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
  signalDate: string | null;
  market: ShockMarket;
  country: string | null;
  jurisdictionGroup: ShockJurisdictionGroup;
  category: string;
  score: number;
  /** First Eligible Signal起点。名前は既存consumer互換のため維持。 */
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
  return Boolean(row.signalDate) && typeof row.benchmarkRelative3m === "number" && Number.isFinite(row.benchmarkRelative3m);
}

export function enrichShockCalibrationObservations(
  records: ShockHistoricalOutcomeRecord[],
  historicalCases: HistoricalShockCase[],
): ShockCalibrationObservation[] {
  const historicalById = new Map(historicalCases.map(item => [item.id, item]));
  return records.map(record => {
    const historical = historicalById.get(record.caseId);
    const country = normalizeShockCountry(historical?.country ?? null, record.market);
    const eligible = record.strategyEligibilityAtCheckpoint === "confirmed_pass";
    return {
      caseId: record.caseId,
      company: record.company,
      checkpoint: record.checkpoint,
      signalDate: eligible ? (record.firstEligibleSignalDate ?? null) : null,
      market: record.market,
      country,
      jurisdictionGroup: inferShockJurisdictionGroup({ country, market: record.market }),
      category: historical?.category ?? "unknown",
      score: record.score,
      benchmarkRelative1m: eligible ? (record.signalBenchmarkRelative1m ?? null) : null,
      benchmarkRelative3m: eligible ? (record.signalBenchmarkRelative3m ?? null) : null,
      benchmarkRelative1y: eligible ? (record.signalBenchmarkRelative1y ?? null) : null,
    };
  });
}

function chronologicalSplit(rows: ShockCalibrationObservation[]): {
  train: ShockCalibrationObservation[];
  validation: ShockCalibrationObservation[];
} {
  const sorted = [...rows].sort((a, b) => {
    const aDate = a.signalDate ?? a.checkpoint;
    const bDate = b.signalDate ?? b.checkpoint;
    return aDate.localeCompare(bDate) || a.caseId.localeCompare(b.caseId);
  });
  if (sorted.length === 0) return { train: [], validation: [] };
  const validationCount = Math.max(MIN_VALIDATION_CASES, Math.ceil(sorted.length * 0.25));
  const splitAt = Math.max(0, sorted.length - validationCount);
  return { train: sorted.slice(0, splitAt), validation: sorted.slice(splitAt) };
}

function holdoutReady(rows: ShockCalibrationObservation[], minimumCases: number): boolean {
  if (rows.length < minimumCases) return false;
  const split = chronologicalSplit(rows);
  return split.train.length >= MIN_TRAIN_CASES && split.validation.length >= MIN_VALIDATION_CASES;
}

function calibrationPools(input: {
  country?: string | null;
  market?: ShockMarket | null;
  category?: string | null;
  observations: ShockCalibrationObservation[];
}) {
  const country = normalizeShockCountry(input.country, input.market ?? null);
  const group = inferShockJurisdictionGroup({ country, market: input.market ?? null });
  const category = input.category ?? null;
  const usable = input.observations.filter(usable3m);
  const groupRows = usable.filter(row => row.jurisdictionGroup === group);
  const countryRows = country == null ? [] : usable.filter(row => row.country === country);
  const countryCategoryRows = category == null ? [] : countryRows.filter(row => row.category === category);
  return { country, group, category, usable, groupRows, countryRows, countryCategoryRows };
}

export function buildShockCalibrationReadinessAtLevel(input: {
  modelLevel: Exclude<ShockCalibrationLevel, "global">;
  country?: string | null;
  market?: ShockMarket | null;
  category?: string | null;
  observations: ShockCalibrationObservation[];
  validatedThreshold?: number | null;
}): ShockCalibrationReadiness {
  const pools = calibrationPools(input);
  const blockers: string[] = [];
  const notes: string[] = [];
  let rows: ShockCalibrationObservation[] = [];
  let minimum = 0;

  if (input.modelLevel === "country_category") {
    rows = pools.countryCategoryRows;
    minimum = MIN_COUNTRY_CATEGORY_CASES;
    if (!pools.country || !pools.category) blockers.push("country_category requires country and category");
  } else if (input.modelLevel === "country") {
    rows = pools.countryRows;
    minimum = MIN_COUNTRY_CASES;
    if (!pools.country) blockers.push("country model requires country");
  } else {
    rows = pools.groupRows;
    minimum = MIN_GROUP_CASES;
  }

  const split = chronologicalSplit(rows);
  const ready = blockers.length === 0 && holdoutReady(rows, minimum);
  let status: ShockCalibrationStatus = ready ? "ready_for_validation" : "insufficient_data";
  let effectiveThreshold = GLOBAL_DEFAULT_SHOCK_THRESHOLD;
  let effectiveThresholdSource: ShockCalibrationReadiness["effectiveThresholdSource"] = "global_default";

  if (!ready) {
    blockers.push(`${input.modelLevel} signal sample/holdout insufficient n=${rows.length} train=${split.train.length} validation=${split.validation.length}`);
  } else if (input.validatedThreshold != null && Number.isFinite(input.validatedThreshold)) {
    status = "validated";
    effectiveThreshold = input.validatedThreshold;
    effectiveThresholdSource = "validated_local";
    notes.push("検証済みlocal thresholdを使用。Global Structural Scoreそのものは変更しない");
  } else {
    notes.push("First Eligible Signalのholdout条件は満たすがvalidated registry未登録のためthreshold=12を維持");
  }

  return {
    country: pools.country,
    market: input.market ?? null,
    category: pools.category,
    jurisdictionGroup: pools.group,
    modelLevel: input.modelLevel,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    globalCases: pools.usable.length,
    groupCases: pools.groupRows.length,
    countryCases: pools.countryRows.length,
    countryCategoryCases: pools.countryCategoryRows.length,
    trainCases: split.train.length,
    validationCases: split.validation.length,
    usableOutcomeCases: rows.length,
    blockers,
    notes,
  };
}

export function buildShockCalibrationReadiness(input: {
  country?: string | null;
  market?: ShockMarket | null;
  category?: string | null;
  observations: ShockCalibrationObservation[];
  validatedThreshold?: number | null;
}): ShockCalibrationReadiness {
  const pools = calibrationPools(input);
  const blockers: string[] = [];
  const notes: string[] = [];

  const countryCategoryReady = holdoutReady(pools.countryCategoryRows, MIN_COUNTRY_CATEGORY_CASES);
  const countryReady = holdoutReady(pools.countryRows, MIN_COUNTRY_CASES);
  const groupReady = holdoutReady(pools.groupRows, MIN_GROUP_CASES);

  let modelLevel: ShockCalibrationLevel = "global";
  let candidateRows = pools.usable;

  if (countryCategoryReady) {
    modelLevel = "country_category";
    candidateRows = pools.countryCategoryRows;
  } else if (countryReady) {
    modelLevel = "country";
    candidateRows = pools.countryRows;
    if (pools.category && pools.countryCategoryRows.length >= MIN_COUNTRY_CATEGORY_CASES) {
      notes.push("country-categoryはsignal母数到達済みだがholdout不足のためcountryモデルへ縮退");
    }
  } else if (groupReady) {
    modelLevel = "jurisdiction_group";
    candidateRows = pools.groupRows;
    if (pools.country && pools.countryRows.length >= MIN_COUNTRY_CASES) {
      notes.push("countryはsignal母数到達済みだがholdout不足のためjurisdiction-groupへ縮退");
    }
  } else {
    if (pools.country && pools.countryRows.length < MIN_COUNTRY_CASES) blockers.push(`country signal sample ${pools.countryRows.length} < ${MIN_COUNTRY_CASES}`);
    if (pools.category && pools.countryCategoryRows.length < MIN_COUNTRY_CATEGORY_CASES) blockers.push(`country-category signal sample ${pools.countryCategoryRows.length} < ${MIN_COUNTRY_CATEGORY_CASES}`);
    if (pools.groupRows.length < MIN_GROUP_CASES) blockers.push(`jurisdiction-group signal sample ${pools.groupRows.length} < ${MIN_GROUP_CASES}`);
    notes.push("十分なFirst Eligible Signal時系列holdoutを持つlocal/region階層がないためGlobal Structural Score + global default thresholdへ縮退");
  }

  const split = chronologicalSplit(candidateRows);
  const validatedThreshold = input.validatedThreshold;
  let status: ShockCalibrationStatus = modelLevel === "global"
    ? (pools.country || pools.category ? "insufficient_data" : "global_default")
    : "ready_for_validation";
  let effectiveThreshold = GLOBAL_DEFAULT_SHOCK_THRESHOLD;
  let effectiveThresholdSource: ShockCalibrationReadiness["effectiveThresholdSource"] = "global_default";

  if (modelLevel !== "global") {
    if (validatedThreshold == null || !Number.isFinite(validatedThreshold)) {
      notes.push("signal時系列holdoutを確保済み。trainで候補閾値を作り、validationで確認するまで12点を維持する");
    } else {
      status = "validated";
      effectiveThreshold = validatedThreshold;
      effectiveThresholdSource = "validated_local";
      notes.push("検証済みlocal thresholdを使用。Global Structural Scoreそのものは変更しない");
    }
  }

  return {
    country: pools.country,
    market: input.market ?? null,
    category: pools.category,
    jurisdictionGroup: pools.group,
    modelLevel,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    globalCases: pools.usable.length,
    groupCases: pools.groupRows.length,
    countryCases: pools.countryRows.length,
    countryCategoryCases: pools.countryCategoryRows.length,
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
  return countries.map(input => buildShockCalibrationReadiness({ ...input, observations }));
}
