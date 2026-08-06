import {
  buildCouncilReplayResult,
  validateCouncilReplayPackage,
  type CouncilReplayPackage,
  type CouncilReplayResult,
  type CouncilReplaySchemas,
} from "./stock-pro-council-replay.js";
import {
  validatePersonaCalibrationLedger,
  validateVerdictCalibrationReferences,
  type PersonaCalibrationRecord,
} from "./stock-pro-council-calibration.js";
import type {
  CouncilIssue,
  StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import type { JsonSchema } from "./schema.js";

export type CalibrationAwareCouncilReplayPackage = CouncilReplayPackage & {
  calibrations: PersonaCalibrationRecord[];
};

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function issue(code: string, target: string, message: string): CouncilIssue {
  return { severity: "error", code, target, message };
}

export function validateCalibrationAwareCouncilReplayPackage(
  pkg: CalibrationAwareCouncilReplayPackage,
  replaySchemas: CouncilReplaySchemas,
  calibrationSchema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): CouncilIssue[] {
  const issues = [
    ...validateCouncilReplayPackage(pkg, replaySchemas, catalog),
    ...validatePersonaCalibrationLedger(pkg.calibrations, calibrationSchema, catalog),
  ];
  const actualHashes = pkg.calibrations.map((record) => record.contentHash);
  if (!equalSets(pkg.manifest.calibrationHashes, actualHashes)) {
    issues.push(issue(
      "calibration_hash_set_mismatch",
      pkg.manifest.replayId,
      "calibration hash集合がmanifestと一致しません",
    ));
  }
  for (const record of pkg.calibrations) {
    if (Date.parse(record.evaluatedAt) > Date.parse(pkg.manifest.createdAt)) {
      issues.push(issue(
        "calibration_after_replay_manifest",
        record.calibrationId,
        "manifest作成後のcalibrationをReplayへ混入できません",
      ));
    }
  }
  issues.push(...validateVerdictCalibrationReferences(pkg.verdicts, pkg.calibrations));
  return issues.sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

export function buildCalibrationAwareCouncilReplayResult(
  pkg: CalibrationAwareCouncilReplayPackage,
  replaySchemas: CouncilReplaySchemas,
  calibrationSchema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): CouncilReplayResult {
  const errors = validateCalibrationAwareCouncilReplayPackage(
    pkg,
    replaySchemas,
    calibrationSchema,
    catalog,
  ).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }
  return buildCouncilReplayResult(pkg, replaySchemas, catalog);
}
