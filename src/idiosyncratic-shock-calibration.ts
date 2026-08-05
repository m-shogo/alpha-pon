// 企業固有ショックの国別/地域別キャリブレーション。
// Global Structural Scoreは変更せず、十分なoutcomeが貯まった階層だけを将来Local Opportunityへ昇格させる。
// retrospective research内のchronological splitはtemporal robustness確認用であり、prospective holdoutとは別物。
// threshold/weights研究の正本は、score gateだけを外したshadow eligibility + replay-ready reaction anchor後のcalibration signal。

import type { HistoricalShockCase } from "./idiosyncratic-shock.js";
import {
  loadShockCaseSelection,
  resolveShockCaseSelection,
  type ShockCaseSelectionMode,
} from "./idiosyncratic-shock-case-selection.js";
import { inferShockJurisdictionGroup, normalizeShockCountry, type ShockJurisdictionGroup } from "./idiosyncratic-shock-jurisdiction.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";
import type { ShockMarket } from "./idiosyncratic-shock-market.js";

export const GLOBAL_DEFAULT_SHOCK_THRESHOLD = 12;
export const MIN_COUNTRY_CASES = 30;
export const MIN_COUNTRY_CATEGORY_CASES = 20;
export const MIN_GROUP_CASES = 40;
export const MIN_VALIDATION_CASES = 8;
export const MIN_TRAIN_CASES = 18;
export const MIN_PROSPECTIVE_HOLDOUT_CASES = 8;

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
  /** threshold-calibration shadow signal起点。名前は既存consumer互換のため維持。 */
  benchmarkRelative1m: number | null;
  benchmarkRelative3m: number | null;
  benchmarkRelative1y: number | null;
  /** selection provenanceが無いmanual/legacy observationはfalse扱い。 */
  selectionMode?: ShockCaseSelectionMode | "legacy_untracked";
  /** trueはprospective_pre_outcomeとしてoutcome観測前登録されたcaseだけ。 */
  validationHoldoutEligible?: boolean;
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
  /** retrospective research poolのchronological split。prospective holdoutではない。 */
  trainCases: number;
  /** retrospective research poolのchronological temporal-validation slice。 */
  validationCases: number;
  usableOutcomeCases: number;
  prospectiveHoldoutCases: number;
  prospectiveHoldoutRequired: number;
  prospectiveHoldoutReady: boolean;
  blockers: string[];
  notes: string[];
};

function usable3m(row: ShockCalibrationObservation): boolean {
  return Boolean(row.signalDate) && typeof row.benchmarkRelative3m === "number" && Number.isFinite(row.benchmarkRelative3m);
}

function isProspectiveHoldout(row: ShockCalibrationObservation): boolean {
  return row.validationHoldoutEligible === true;
}

export function enrichShockCalibrationObservations(
  records: ShockHistoricalOutcomeRecord[],
  historicalCases: HistoricalShockCase[],
): ShockCalibrationObservation[] {
  const historicalById = new Map(historicalCases.map(item => [item.id, item]));
  const selections = loadShockCaseSelection();
  return records.map(record => {
    const historical = historicalById.get(record.caseId);
    const country = normalizeShockCountry(historical?.country ?? null, record.market);
    const selection = resolveShockCaseSelection(record.caseId, selections.get(record.caseId));
    // production thresholdを通ったsignalではなくshadow signalを使う。
    // 旧outcome JSONにはshadow fieldsが無いため自動的にeligible=falseとなり、read-sideでもfail-closed。
    const eligible = record.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass"
      && record.reactionAnchorStatus === "verified";
    return {
      caseId: record.caseId,
      company: record.company,
      checkpoint: record.checkpoint,
      signalDate: eligible ? (record.calibrationFirstEligibleSignalDate ?? null) : null,
      market: record.market,
      country,
      jurisdictionGroup: inferShockJurisdictionGroup({ country, market: record.market }),
      category: historical?.category ?? "unknown",
      score: record.score,
      benchmarkRelative1m: eligible ? (record.calibrationSignalBenchmarkRelative1m ?? null) : null,
      benchmarkRelative3m: eligible ? (record.calibrationSignalBenchmarkRelative3m ?? null) : null,
      benchmarkRelative1y: eligible ? (record.calibrationSignalBenchmarkRelative1y ?? null) : null,
      selectionMode: selection.selectionMode,
      validationHoldoutEligible: selection.validationHoldoutEligible,
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

function temporalSplitReady(rows: ShockCalibrationObservation[], minimumCases: number): boolean {
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
  // Prospective holdoutはthreshold fittingやretrospective temporal splitへ入れない。
  const researchUsable = usable.filter(row => !isProspectiveHoldout(row));
  const prospectiveUsable = usable.filter(isProspectiveHoldout);

  const groupRows = researchUsable.filter(row => row.jurisdictionGroup === group);
  const countryRows = country == null ? [] : researchUsable.filter(row => row.country === country);
  const countryCategoryRows = category == null ? [] : countryRows.filter(row => row.category === category);
  const prospectiveGroupRows = prospectiveUsable.filter(row => row.jurisdictionGroup === group);
  const prospectiveCountryRows = country == null ? [] : prospectiveUsable.filter(row => row.country === country);
  const prospectiveCountryCategoryRows = category == null ? [] : prospectiveCountryRows.filter(row => row.category === category);

  return {
    country,
    group,
    category,
    researchUsable,
    prospectiveUsable,
    groupRows,
    countryRows,
    countryCategoryRows,
    prospectiveGroupRows,
    prospectiveCountryRows,
    prospectiveCountryCategoryRows,
  };
}

function rowsForLevel(
  pools: ReturnType<typeof calibrationPools>,
  modelLevel: Exclude<ShockCalibrationLevel, "global">,
): { researchRows: ShockCalibrationObservation[]; prospectiveRows: ShockCalibrationObservation[]; minimum: number } {
  if (modelLevel === "country_category") {
    return {
      researchRows: pools.countryCategoryRows,
      prospectiveRows: pools.prospectiveCountryCategoryRows,
      minimum: MIN_COUNTRY_CATEGORY_CASES,
    };
  }
  if (modelLevel === "country") {
    return {
      researchRows: pools.countryRows,
      prospectiveRows: pools.prospectiveCountryRows,
      minimum: MIN_COUNTRY_CASES,
    };
  }
  return {
    researchRows: pools.groupRows,
    prospectiveRows: pools.prospectiveGroupRows,
    minimum: MIN_GROUP_CASES,
  };
}

function applyValidatedThreshold(input: {
  temporallyReady: boolean;
  validatedThreshold?: number | null;
  prospectiveRows: ShockCalibrationObservation[];
  status: ShockCalibrationStatus;
  effectiveThreshold: number;
  effectiveThresholdSource: ShockCalibrationReadiness["effectiveThresholdSource"];
  blockers: string[];
  notes: string[];
}): Pick<ShockCalibrationReadiness, "status" | "effectiveThreshold" | "effectiveThresholdSource" | "prospectiveHoldoutCases" | "prospectiveHoldoutRequired" | "prospectiveHoldoutReady"> {
  const prospectiveHoldoutCases = input.prospectiveRows.length;
  const prospectiveHoldoutReady = prospectiveHoldoutCases >= MIN_PROSPECTIVE_HOLDOUT_CASES;
  let status = input.status;
  let effectiveThreshold = input.effectiveThreshold;
  let effectiveThresholdSource = input.effectiveThresholdSource;

  if (input.validatedThreshold != null && Number.isFinite(input.validatedThreshold)) {
    if (!input.temporallyReady) {
      input.blockers.push("validated threshold ignored because retrospective temporal-validation sample is insufficient");
    } else if (!prospectiveHoldoutReady) {
      input.blockers.push(`prospective holdout ${prospectiveHoldoutCases}/${MIN_PROSPECTIVE_HOLDOUT_CASES}`);
      input.notes.push("registry thresholdは存在するが、outcome観測前登録のprospective holdoutが不足するためthreshold=12を維持");
    } else {
      status = "validated";
      effectiveThreshold = input.validatedThreshold;
      effectiveThresholdSource = "validated_local";
      input.notes.push("retrospective temporal validationに加えprospective pre-outcome holdoutを満たしたlocal thresholdを使用");
    }
  }

  return {
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    prospectiveHoldoutCases,
    prospectiveHoldoutRequired: MIN_PROSPECTIVE_HOLDOUT_CASES,
    prospectiveHoldoutReady,
  };
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
  const level = rowsForLevel(pools, input.modelLevel);

  if (input.modelLevel === "country_category" && (!pools.country || !pools.category)) blockers.push("country_category requires country and category");
  if (input.modelLevel === "country" && !pools.country) blockers.push("country model requires country");

  const split = chronologicalSplit(level.researchRows);
  const temporallyReady = blockers.length === 0 && temporalSplitReady(level.researchRows, level.minimum);
  let status: ShockCalibrationStatus = temporallyReady ? "ready_for_validation" : "insufficient_data";
  let effectiveThreshold = GLOBAL_DEFAULT_SHOCK_THRESHOLD;
  let effectiveThresholdSource: ShockCalibrationReadiness["effectiveThresholdSource"] = "global_default";

  if (!temporallyReady) {
    blockers.push(`${input.modelLevel} retrospective temporal sample insufficient n=${level.researchRows.length} train=${split.train.length} validation=${split.validation.length}`);
  } else if (input.validatedThreshold == null || !Number.isFinite(input.validatedThreshold)) {
    notes.push("retrospective chronological validation条件は満たすが、prospective確認済みregistryなしのためthreshold=12を維持");
  }

  const validation = applyValidatedThreshold({
    temporallyReady,
    validatedThreshold: input.validatedThreshold,
    prospectiveRows: level.prospectiveRows,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    blockers,
    notes,
  });
  status = validation.status;
  effectiveThreshold = validation.effectiveThreshold;
  effectiveThresholdSource = validation.effectiveThresholdSource;

  return {
    country: pools.country,
    market: input.market ?? null,
    category: pools.category,
    jurisdictionGroup: pools.group,
    modelLevel: input.modelLevel,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    globalCases: pools.researchUsable.length,
    groupCases: pools.groupRows.length,
    countryCases: pools.countryRows.length,
    countryCategoryCases: pools.countryCategoryRows.length,
    trainCases: split.train.length,
    validationCases: split.validation.length,
    usableOutcomeCases: level.researchRows.length,
    prospectiveHoldoutCases: validation.prospectiveHoldoutCases,
    prospectiveHoldoutRequired: validation.prospectiveHoldoutRequired,
    prospectiveHoldoutReady: validation.prospectiveHoldoutReady,
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

  const countryCategoryReady = temporalSplitReady(pools.countryCategoryRows, MIN_COUNTRY_CATEGORY_CASES);
  const countryReady = temporalSplitReady(pools.countryRows, MIN_COUNTRY_CASES);
  const groupReady = temporalSplitReady(pools.groupRows, MIN_GROUP_CASES);

  let modelLevel: ShockCalibrationLevel = "global";
  let candidateRows = pools.researchUsable;
  let prospectiveRows = pools.prospectiveUsable;

  if (countryCategoryReady) {
    modelLevel = "country_category";
    candidateRows = pools.countryCategoryRows;
    prospectiveRows = pools.prospectiveCountryCategoryRows;
  } else if (countryReady) {
    modelLevel = "country";
    candidateRows = pools.countryRows;
    prospectiveRows = pools.prospectiveCountryRows;
    if (pools.category && pools.countryCategoryRows.length >= MIN_COUNTRY_CATEGORY_CASES) {
      notes.push("country-categoryはretrospective母数到達済みだがtemporal split不足のためcountryモデルへ縮退");
    }
  } else if (groupReady) {
    modelLevel = "jurisdiction_group";
    candidateRows = pools.groupRows;
    prospectiveRows = pools.prospectiveGroupRows;
    if (pools.country && pools.countryRows.length >= MIN_COUNTRY_CASES) {
      notes.push("countryはretrospective母数到達済みだがtemporal split不足のためjurisdiction-groupへ縮退");
    }
  } else {
    if (pools.country && pools.countryRows.length < MIN_COUNTRY_CASES) blockers.push(`country retrospective shadow sample ${pools.countryRows.length} < ${MIN_COUNTRY_CASES}`);
    if (pools.category && pools.countryCategoryRows.length < MIN_COUNTRY_CATEGORY_CASES) blockers.push(`country-category retrospective shadow sample ${pools.countryCategoryRows.length} < ${MIN_COUNTRY_CATEGORY_CASES}`);
    if (pools.groupRows.length < MIN_GROUP_CASES) blockers.push(`jurisdiction-group retrospective shadow sample ${pools.groupRows.length} < ${MIN_GROUP_CASES}`);
    notes.push("十分なretrospective temporal-validationを持つlocal/region階層がないためGlobal Structural Score + global default thresholdへ縮退");
  }

  const split = chronologicalSplit(candidateRows);
  let status: ShockCalibrationStatus = modelLevel === "global"
    ? (pools.country || pools.category ? "insufficient_data" : "global_default")
    : "ready_for_validation";
  let effectiveThreshold = GLOBAL_DEFAULT_SHOCK_THRESHOLD;
  let effectiveThresholdSource: ShockCalibrationReadiness["effectiveThresholdSource"] = "global_default";

  if (modelLevel !== "global" && (input.validatedThreshold == null || !Number.isFinite(input.validatedThreshold))) {
    notes.push("retrospective temporal-validation条件を確保済み。候補閾値を固定後、prospective pre-outcome holdoutで確認するまで12点を維持する");
  }

  const validation = applyValidatedThreshold({
    temporallyReady: modelLevel !== "global",
    validatedThreshold: input.validatedThreshold,
    prospectiveRows,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    blockers,
    notes,
  });
  status = validation.status;
  effectiveThreshold = validation.effectiveThreshold;
  effectiveThresholdSource = validation.effectiveThresholdSource;

  return {
    country: pools.country,
    market: input.market ?? null,
    category: pools.category,
    jurisdictionGroup: pools.group,
    modelLevel,
    status,
    effectiveThreshold,
    effectiveThresholdSource,
    globalCases: pools.researchUsable.length,
    groupCases: pools.groupRows.length,
    countryCases: pools.countryRows.length,
    countryCategoryCases: pools.countryCategoryRows.length,
    trainCases: split.train.length,
    validationCases: split.validation.length,
    usableOutcomeCases: candidateRows.length,
    prospectiveHoldoutCases: validation.prospectiveHoldoutCases,
    prospectiveHoldoutRequired: validation.prospectiveHoldoutRequired,
    prospectiveHoldoutReady: validation.prospectiveHoldoutReady,
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
