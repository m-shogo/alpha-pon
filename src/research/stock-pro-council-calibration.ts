import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  loadCouncilSchema,
  loadCouncilYaml,
  STOCK_PRO_COUNCIL_V2_PATHS,
  type CouncilIssue,
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type PersonaCalibrationStatus = "provisional" | "eligible" | "retired" | "superseded";

export type PersonaCalibrationRecord = {
  schemaVersion: 1;
  calibrationId: string;
  personaId: string;
  personaVersion: string;
  jurisdiction: string;
  metric: string;
  segment: {
    sector: string;
    regime: string;
    horizon: string;
    edgeId?: string;
  };
  periodFrom: string;
  periodTo: string;
  outcomeCutoff: string;
  evaluatedAt: string;
  sampleSize: number;
  minimumSampleSize: number;
  normalizedScore: number;
  confidenceInterval: { low: number; high: number };
  status: PersonaCalibrationStatus;
  eligibleForConfidence: boolean;
  confidenceCap?: number;
  previousWeightMultiplier: number;
  recommendedWeightMultiplier: number;
  maxWeightStep: 0.05;
  humanApprovalRequired: true;
  automaticWeightApplicationAuthorized: false;
  evidenceRefs: string[];
  modelVersion: string;
  ruleVersion: string;
  supersedesCalibrationId?: string;
  contentHash: string;
};

export type PersonaCalibrationRecordInput = Omit<PersonaCalibrationRecord, "contentHash">;

export const PERSONA_CALIBRATION_PATHS = {
  dir: "research/persona_calibrations",
  schema: "research/schemas/persona-calibration-record.schema.json",
} as const;

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutHash(record: PersonaCalibrationRecord): PersonaCalibrationRecordInput {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computePersonaCalibrationHash(
  record: PersonaCalibrationRecord | PersonaCalibrationRecordInput,
): string {
  return hashValue("contentHash" in record ? withoutHash(record) : record);
}

export function withPersonaCalibrationHash(
  record: PersonaCalibrationRecordInput,
): PersonaCalibrationRecord {
  return { ...record, contentHash: computePersonaCalibrationHash(record) };
}

export function requiredMinimumSample(metric: string): number {
  if (metric.includes("calibration") || metric.includes("confidence")) return 50;
  if (metric.includes("alpha") || metric.includes("excess_return")) return 40;
  return 30;
}

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

function schemaIssues(value: unknown, schema: JsonSchema, target: string): CouncilIssue[] {
  return validate(value, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path ? `${target}:${error.path}` : target,
    message: error.message,
  }));
}

function personaIdentityKey(record: PersonaCalibrationRecord): string {
  return [
    record.personaId,
    record.personaVersion,
    record.jurisdiction,
    record.metric,
    record.segment.sector,
    record.segment.regime,
    record.segment.horizon,
    record.segment.edgeId ?? "*",
    record.modelVersion,
  ].join(":");
}

export function validatePersonaCalibrationRecord(
  value: unknown,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
  target = "PersonaCalibrationRecord",
): CouncilIssue[] {
  const issues = schemaIssues(value, schema, target);
  if (issues.length > 0) return sortIssues(issues);
  const record = value as PersonaCalibrationRecord;
  const persona = catalog.personas.find((item) => item.id === record.personaId);
  if (!persona) {
    issues.push(issue("unknown_persona", `${target}.personaId`, record.personaId));
    return sortIssues(issues);
  }
  if (record.personaVersion !== String(catalog.version)) {
    issues.push(issue(
      "persona_version_mismatch",
      `${target}.personaVersion`,
      `${record.personaVersion} != ${catalog.version}`,
    ));
  }
  if (!persona.jurisdiction.includes(record.jurisdiction)) {
    issues.push(issue(
      "jurisdiction_violation",
      `${target}.jurisdiction`,
      `${record.personaId}のjurisdiction外です: ${record.jurisdiction}`,
    ));
  }
  if (!persona.calibration.includes(record.metric)) {
    issues.push(issue(
      "unregistered_calibration_metric",
      `${target}.metric`,
      `${record.personaId}に登録されていないmetricです: ${record.metric}`,
    ));
  }
  if (record.contentHash !== computePersonaCalibrationHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (record.periodFrom > record.periodTo) {
    issues.push(issue("invalid_calibration_period", target, "periodFromはperiodTo以前が必要です"));
  }
  if (record.periodTo > record.outcomeCutoff.slice(0, 10)) {
    issues.push(issue(
      "period_after_outcome_cutoff",
      `${target}.periodTo`,
      "periodToをoutcomeCutoffより後にできません",
    ));
  }
  if (
    compareExplicitIso8601Instants(
      record.evaluatedAt,
      record.outcomeCutoff,
      `${target}.evaluatedAt`,
      `${target}.outcomeCutoff`,
    ) < 0
  ) {
    issues.push(issue(
      "evaluated_before_outcome_cutoff",
      `${target}.evaluatedAt`,
      "evaluatedAtはoutcomeCutoff以後である必要があります",
    ));
  }

  const expectedMinimum = requiredMinimumSample(record.metric);
  if (record.minimumSampleSize !== expectedMinimum) {
    issues.push(issue(
      "minimum_sample_policy_mismatch",
      `${target}.minimumSampleSize`,
      `${record.metric}のminimumSampleSizeは${expectedMinimum}です`,
    ));
  }
  const { low, high } = record.confidenceInterval;
  if (low > high || record.normalizedScore < low || record.normalizedScore > high) {
    issues.push(issue(
      "invalid_confidence_interval",
      `${target}.confidenceInterval`,
      "low <= normalizedScore <= highが必要です",
    ));
  }

  const shouldBeEligible = record.status === "eligible";
  if (record.eligibleForConfidence !== shouldBeEligible) {
    issues.push(issue(
      "confidence_eligibility_status_mismatch",
      target,
      "eligibleForConfidence=trueはstatus=eligibleの場合だけ許可されます",
    ));
  }
  if (record.status === "eligible") {
    if (record.sampleSize < record.minimumSampleSize) {
      issues.push(issue(
        "insufficient_calibration_sample",
        `${target}.sampleSize`,
        `${record.sampleSize} < ${record.minimumSampleSize}`,
      ));
    }
    if (record.confidenceCap === undefined) {
      issues.push(issue(
        "eligible_calibration_without_cap",
        `${target}.confidenceCap`,
        "eligible calibrationにはconfidenceCapが必要です",
      ));
    }
  } else if (record.confidenceCap !== undefined) {
    issues.push(issue(
      "ineligible_calibration_has_cap",
      `${target}.confidenceCap`,
      `${record.status} calibrationにconfidenceCapを設定できません`,
    ));
  }

  const weightStep = Math.abs(
    record.recommendedWeightMultiplier - record.previousWeightMultiplier,
  );
  if (weightStep > record.maxWeightStep + Number.EPSILON) {
    issues.push(issue(
      "calibration_weight_step_exceeded",
      `${target}.recommendedWeightMultiplier`,
      `weight変更${weightStep.toFixed(6)}は上限${record.maxWeightStep}を超えます`,
    ));
  }
  if (record.status === "provisional" && record.sampleSize >= record.minimumSampleSize) {
    issues.push({
      severity: "warning",
      code: "provisional_calibration_recheck_due",
      target,
      message: "minimum sampleへ到達しています。eligible化の根拠を再評価してください",
    });
  }
  return sortIssues(issues);
}

function duplicateIssues(values: string[], code: string, target: string): CouncilIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

function assertNoCycles(records: PersonaCalibrationRecord[]): CouncilIssue[] {
  const byId = new Map(records.map((record) => [record.calibrationId, record]));
  const issues: CouncilIssue[] = [];
  for (const record of records) {
    const seen = new Set<string>();
    let current: PersonaCalibrationRecord | undefined = record;
    while (current?.supersedesCalibrationId) {
      if (seen.has(current.calibrationId)) {
        issues.push(issue("calibration_revision_cycle", record.calibrationId, "revision cycleがあります"));
        break;
      }
      seen.add(current.calibrationId);
      current = byId.get(current.supersedesCalibrationId);
    }
  }
  return issues;
}

export function validatePersonaCalibrationLedger(
  records: PersonaCalibrationRecord[],
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): CouncilIssue[] {
  const issues = records.flatMap((record, index) =>
    validatePersonaCalibrationRecord(
      record,
      schema,
      catalog,
      `calibration[${index}](${record.calibrationId})`,
    ),
  );
  issues.push(
    ...duplicateIssues(records.map((record) => record.calibrationId), "duplicate_calibration_id", "calibration"),
    ...duplicateIssues(records.map((record) => record.contentHash), "duplicate_content_hash", "calibration"),
  );

  const byId = new Map(records.map((record) => [record.calibrationId, record]));
  const superseded = new Set<string>();
  for (const record of records) {
    if (!record.supersedesCalibrationId) continue;
    superseded.add(record.supersedesCalibrationId);
    const previous = byId.get(record.supersedesCalibrationId);
    if (!previous) {
      issues.push(issue(
        "missing_calibration_parent",
        record.calibrationId,
        record.supersedesCalibrationId,
      ));
      continue;
    }
    if (personaIdentityKey(record) !== personaIdentityKey(previous)) {
      issues.push(issue(
        "calibration_revision_identity_mismatch",
        record.calibrationId,
        "persona/version/jurisdiction/metric/segment/modelをrevisionで変更できません",
      ));
    }
    if (
      compareExplicitIso8601Instants(
        record.evaluatedAt,
        previous.evaluatedAt,
        `calibration.${record.calibrationId}.evaluatedAt`,
        `calibration.${previous.calibrationId}.evaluatedAt`,
      ) <= 0
    ) {
      issues.push(issue(
        "calibration_revision_time_not_monotonic",
        record.calibrationId,
        "evaluatedAtは直前recordより後である必要があります",
      ));
    }
    if (
      compareExplicitIso8601Instants(
        record.outcomeCutoff,
        previous.outcomeCutoff,
        `calibration.${record.calibrationId}.outcomeCutoff`,
        `calibration.${previous.calibrationId}.outcomeCutoff`,
      ) < 0
    ) {
      issues.push(issue(
        "calibration_cutoff_regression",
        record.calibrationId,
        "outcomeCutoffを過去へ戻せません",
      ));
    }
  }
  issues.push(...assertNoCycles(records));

  const heads = records.filter((record) => !superseded.has(record.calibrationId));
  const headCounts = new Map<string, number>();
  for (const record of heads) {
    const key = personaIdentityKey(record);
    headCounts.set(key, (headCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of headCounts) {
    if (count > 1) {
      issues.push(issue("multiple_calibration_heads", key, `${count} heads`));
    }
  }
  return sortIssues(issues);
}

export function activePersonaCalibrationHeads(
  records: PersonaCalibrationRecord[],
): PersonaCalibrationRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesCalibrationId ? [record.supersedesCalibrationId] : []),
  );
  return records.filter((record) => !superseded.has(record.calibrationId));
}

export function validateVerdictCalibrationReferences(
  verdicts: PersonaVerdict[],
  calibrations: PersonaCalibrationRecord[],
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const activeById = new Map(
    activePersonaCalibrationHeads(calibrations).map((record) => [record.calibrationId, record]),
  );
  const allById = new Map(calibrations.map((record) => [record.calibrationId, record]));

  for (const verdict of verdicts) {
    if (verdict.confidence === undefined) continue;
    const ref = verdict.calibrationRef;
    if (!ref) {
      issues.push(issue("confidence_without_calibration", verdict.personaId, "calibrationRefが必要です"));
      continue;
    }
    const calibration = activeById.get(ref);
    if (!calibration) {
      if (allById.has(ref)) {
        issues.push(issue(
          "superseded_calibration_reference",
          verdict.personaId,
          `active headではないcalibrationRefです: ${ref}`,
        ));
      } else {
        issues.push(issue(
          "missing_calibration_reference",
          verdict.personaId,
          `calibrationRefが存在しません: ${ref}`,
        ));
      }
      continue;
    }
    if (
      calibration.status !== "eligible" ||
      !calibration.eligibleForConfidence ||
      calibration.confidenceCap === undefined
    ) {
      issues.push(issue(
        "ineligible_calibration_reference",
        verdict.personaId,
        `${ref}はconfidence利用可能ではありません`,
      ));
    }
    if (
      calibration.personaId !== verdict.personaId ||
      calibration.personaVersion !== verdict.personaVersion ||
      calibration.jurisdiction !== verdict.jurisdiction ||
      calibration.modelVersion !== verdict.modelVersion
    ) {
      issues.push(issue(
        "calibration_identity_mismatch",
        verdict.personaId,
        "calibrationのpersona/version/jurisdiction/modelがVerdictと一致しません",
      ));
    }
    if (
      compareExplicitIso8601Instants(
        calibration.evaluatedAt,
        verdict.issuedAt,
        `calibration.${calibration.calibrationId}.evaluatedAt`,
        `verdict.${verdict.personaId}.issuedAt`,
      ) > 0
    ) {
      issues.push(issue(
        "future_calibration_reference",
        verdict.personaId,
        "Verdict発行後に計算されたcalibrationを利用できません",
      ));
    }
    if (
      compareExplicitIso8601Instants(
        calibration.outcomeCutoff,
        verdict.informationCutoff,
        `calibration.${calibration.calibrationId}.outcomeCutoff`,
        `verdict.${verdict.personaId}.informationCutoff`,
      ) > 0
    ) {
      issues.push(issue(
        "calibration_outcome_after_verdict_cutoff",
        verdict.personaId,
        "Verdict informationCutoff後のoutcomeを含むcalibrationは利用できません",
      ));
    }
    if (
      calibration.confidenceCap !== undefined &&
      verdict.confidence > calibration.confidenceCap
    ) {
      issues.push(issue(
        "confidence_exceeds_calibrated_cap",
        verdict.personaId,
        `${verdict.confidence} > ${calibration.confidenceCap}`,
      ));
    }
  }
  return sortIssues(issues);
}

export function parsePersonaCalibrationJsonl(
  content: string,
  sourceName: string,
): PersonaCalibrationRecord[] {
  const records: PersonaCalibrationRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as PersonaCalibrationRecord);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}: ${(error as Error).message}`);
    }
  }
  return records;
}

function readCalibrationFile(path: string): PersonaCalibrationRecord[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parsePersonaCalibrationJsonl(content, path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`calibration lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendPersonaCalibrationRecords(
  path: string,
  incoming: PersonaCalibrationRecord[],
  ownerToken: string,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): void {
  if (incoming.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`calibration lock is already held: ${lockPath}`);
    }
    throw error;
  }
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existing = readCalibrationFile(path);
    const errors = validatePersonaCalibrationLedger(
      [...existing, ...incoming],
      schema,
      catalog,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }
    const fd = openSync(path, "a");
    try {
      appendFileSync(fd, `${incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } finally {
    releaseLock(lockPath, ownerToken);
  }
}

export function loadPersonaCalibrationContext(): {
  catalog: StockProCouncilV2Catalog;
  schema: JsonSchema;
} {
  return {
    catalog: loadCouncilYaml(STOCK_PRO_COUNCIL_V2_PATHS.catalog) as StockProCouncilV2Catalog,
    schema: loadCouncilSchema(PERSONA_CALIBRATION_PATHS.schema),
  };
}
