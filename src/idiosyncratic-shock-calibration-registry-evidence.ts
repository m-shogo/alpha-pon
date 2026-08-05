// Validated local threshold registryの「申告された期間・件数」と、実際のoutcome observationsを照合する。
// registry metadataだけでvalidatedを名乗れないようにするためのoffline fail-closed audit helper。

import {
  buildShockCalibrationReadinessAtLevel,
  type ShockCalibrationObservation,
} from "./idiosyncratic-shock-calibration.js";
import type { ValidatedLocalShockThreshold } from "./idiosyncratic-shock-calibration-config.js";

export type ShockCalibrationRegistryEvidenceAudit = {
  id: string;
  researchObservationsInTrainWindow: number;
  prospectiveObservationsInValidationWindow: number;
  claimedTrainCases: number;
  claimedValidationCases: number;
  readinessStatus: string;
  issues: string[];
};

function inRange(value: string, from: string, through: string): boolean {
  return value >= from && value <= through;
}

export function auditValidatedLocalThresholdEvidence(
  entry: ValidatedLocalShockThreshold,
  observations: ShockCalibrationObservation[],
): ShockCalibrationRegistryEvidenceAudit {
  // Prospective rows outside the declared validation window are not allowed to
  // satisfy this registry entry. Research rows outside the declared train window
  // are likewise excluded so later historical additions cannot silently backfill
  // an older registry claim.
  const scopedObservations = observations.filter(row => {
    if (row.validationHoldoutEligible === true) {
      return inRange(row.checkpoint, entry.validationFrom, entry.validationThrough);
    }
    return inRange(row.checkpoint, entry.trainFrom, entry.trainThrough);
  });

  const readiness = buildShockCalibrationReadinessAtLevel({
    modelLevel: entry.modelLevel,
    country: entry.country ?? null,
    market: entry.market ?? null,
    category: entry.category ?? null,
    observations: scopedObservations,
    validatedThreshold: entry.threshold,
  });

  const issues: string[] = [];
  if (readiness.usableOutcomeCases < entry.trainCases) {
    issues.push(`actual train-window research outcomes ${readiness.usableOutcomeCases} < registry trainCases ${entry.trainCases}`);
  }
  if (readiness.prospectiveHoldoutCases < entry.validationCases) {
    issues.push(`actual validation-window prospective outcomes ${readiness.prospectiveHoldoutCases} < registry validationCases ${entry.validationCases}`);
  }
  if (readiness.status !== "validated") {
    issues.push(`scoped readiness status=${readiness.status}, expected validated`);
  }

  return {
    id: entry.id,
    researchObservationsInTrainWindow: readiness.usableOutcomeCases,
    prospectiveObservationsInValidationWindow: readiness.prospectiveHoldoutCases,
    claimedTrainCases: entry.trainCases,
    claimedValidationCases: entry.validationCases,
    readinessStatus: readiness.status,
    issues,
  };
}
