import {
  activePersonaCalibrationHeads,
  validatePersonaCalibrationLedger,
  type PersonaCalibrationRecord,
} from "./stock-pro-council-calibration.js";
import type {
  CouncilIssue,
  StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import type { JsonSchema } from "./schema.js";

function issue(code: string, target: string, message: string): CouncilIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: CouncilIssue[]): CouncilIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function transitionAllowed(
  previous: PersonaCalibrationRecord["status"],
  current: PersonaCalibrationRecord["status"],
): boolean {
  const allowed: Record<
    PersonaCalibrationRecord["status"],
    ReadonlySet<PersonaCalibrationRecord["status"]>
  > = {
    provisional: new Set(["provisional", "eligible", "retired", "superseded"]),
    eligible: new Set(["eligible", "retired", "superseded"]),
    retired: new Set(["superseded"]),
    superseded: new Set(),
  };
  return allowed[previous].has(current);
}

export function validatePersonaCalibrationLifecycle(
  records: PersonaCalibrationRecord[],
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const byId = new Map(records.map((record) => [record.calibrationId, record]));
  for (const record of records) {
    if (!record.supersedesCalibrationId) continue;
    const previous = byId.get(record.supersedesCalibrationId);
    if (!previous) continue;

    if (!transitionAllowed(previous.status, record.status)) {
      issues.push(issue(
        "invalid_calibration_status_transition",
        record.calibrationId,
        `${previous.status} -> ${record.status} は許可されません`,
      ));
    }
    if (record.sampleSize < previous.sampleSize) {
      issues.push(issue(
        "calibration_sample_regression",
        record.calibrationId,
        `${record.sampleSize} < ${previous.sampleSize}`,
      ));
    }
    if (record.periodFrom !== previous.periodFrom) {
      issues.push(issue(
        "calibration_period_start_changed",
        record.calibrationId,
        "同一calibration chainのperiodFromを変更できません",
      ));
    }
    if (record.periodTo < previous.periodTo) {
      issues.push(issue(
        "calibration_period_regression",
        record.calibrationId,
        `${record.periodTo} < ${previous.periodTo}`,
      ));
    }
    if (
      previous.status === "eligible" &&
      record.status === "eligible" &&
      record.confidenceCap !== undefined &&
      previous.confidenceCap !== undefined &&
      Math.abs(record.confidenceCap - previous.confidenceCap) > 0.1 + Number.EPSILON
    ) {
      issues.push(issue(
        "confidence_cap_step_exceeded",
        record.calibrationId,
        "eligible revisionのconfidenceCap変更は1回0.1以内に制限されます",
      ));
    }
  }
  return sortIssues(issues);
}

export function validatePersonaCalibrationLedgerGoverned(
  records: PersonaCalibrationRecord[],
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): CouncilIssue[] {
  return sortIssues([
    ...validatePersonaCalibrationLedger(records, schema, catalog),
    ...validatePersonaCalibrationLifecycle(records),
  ]);
}

export function eligiblePersonaCalibrationHeads(
  records: PersonaCalibrationRecord[],
): PersonaCalibrationRecord[] {
  return activePersonaCalibrationHeads(records).filter(
    (record) => record.status === "eligible" && record.eligibleForConfidence,
  );
}
