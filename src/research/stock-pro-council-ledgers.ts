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
  STOCK_PRO_COUNCIL_V2_PATHS,
  loadCouncilSchema,
  loadCouncilYaml,
  type CouncilIssue,
  type CouncilPersona,
  type StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type DissentStatus = "open" | "acknowledged" | "resolved" | "superseded";
export type VetoStatus = "binding" | "cleared" | "superseded";
export type VetoClearanceMode = "new_evidence" | "versioned_rule_correction";

export type CouncilDissentRecord = {
  schemaVersion: 1;
  dissentId: string;
  dissentCode: string;
  councilRunId: string;
  personaId: string;
  personaVersion: string;
  issuedAt: string;
  informationCutoff: string;
  jurisdiction: string;
  stance: "oppose" | "neutral" | "abstain" | "veto";
  summary: string;
  evidenceRefs: string[];
  unresolvedQuestions: string[];
  status: DissentStatus;
  supersedesDissentId?: string;
  resolvedAt?: string;
  resolutionSummary?: string;
  resolutionEvidenceRefs?: string[];
  contentHash: string;
};

export type CouncilVetoRecord = {
  schemaVersion: 1;
  vetoId: string;
  councilRunId: string;
  personaId: string;
  personaVersion: string;
  jurisdiction: string;
  vetoCode: string;
  scope: "data" | "recommendation" | "execution" | "position" | "short";
  issuedAt: string;
  informationCutoff: string;
  evidenceRefs: string[];
  clearanceRequirements: string[];
  status: VetoStatus;
  supersedesVetoId?: string;
  clearanceMode?: VetoClearanceMode;
  clearedAt?: string;
  clearanceEvidenceRefs?: string[];
  ruleVersion: string;
  contentHash: string;
};

export type CouncilDissentRecordInput = Omit<CouncilDissentRecord, "contentHash">;
export type CouncilVetoRecordInput = Omit<CouncilVetoRecord, "contentHash">;

export const COUNCIL_LEDGER_PATHS = {
  dissent: "research/council_ledgers/dissent.jsonl",
  veto: "research/council_ledgers/veto.jsonl",
  dissentSchema: "research/schemas/council-dissent-record.schema.json",
  vetoSchema: "research/schemas/council-veto-record.schema.json",
} as const;

function withoutHash<T extends { contentHash: string }>(record: T): Omit<T, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeCouncilLedgerHash(
  record: CouncilDissentRecord | CouncilDissentRecordInput | CouncilVetoRecord | CouncilVetoRecordInput,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withDissentHash(record: CouncilDissentRecordInput): CouncilDissentRecord {
  return { ...record, contentHash: computeCouncilLedgerHash(record) };
}

export function withVetoHash(record: CouncilVetoRecordInput): CouncilVetoRecord {
  return { ...record, contentHash: computeCouncilLedgerHash(record) };
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

function personaMap(catalog: StockProCouncilV2Catalog): Map<string, CouncilPersona> {
  return new Map(catalog.personas.map((persona) => [persona.id, persona]));
}

function commonPersonaIssues(
  record: Pick<
    CouncilDissentRecord | CouncilVetoRecord,
    "personaId" | "personaVersion" | "jurisdiction" | "issuedAt" | "informationCutoff"
  >,
  catalog: StockProCouncilV2Catalog,
  target: string,
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const persona = personaMap(catalog).get(record.personaId);
  if (!persona) {
    issues.push({
      severity: "error",
      code: "unknown_persona",
      target: `${target}.personaId`,
      message: `catalogに存在しないpersonaです: ${record.personaId}`,
    });
    return issues;
  }
  if (record.personaVersion !== String(catalog.version)) {
    issues.push({
      severity: "error",
      code: "persona_version_mismatch",
      target: `${target}.personaVersion`,
      message: `personaVersion=${record.personaVersion}はcatalog version=${catalog.version}と一致しません`,
    });
  }
  if (!persona.jurisdiction.includes(record.jurisdiction)) {
    issues.push({
      severity: "error",
      code: "jurisdiction_violation",
      target: `${target}.jurisdiction`,
      message: `${record.personaId}のjurisdiction外です: ${record.jurisdiction}`,
    });
  }
  if (compareExplicitIso8601Instants(
    record.issuedAt,
    record.informationCutoff,
    `${target}.issuedAt`,
    `${target}.informationCutoff`,
  ) < 0) {
    issues.push({
      severity: "error",
      code: "issued_before_information_cutoff",
      target: `${target}.issuedAt`,
      message: "issuedAtはinformationCutoff以後である必要があります",
    });
  }
  return issues;
}

function hashIssue(
  record: CouncilDissentRecord | CouncilVetoRecord,
  target: string,
): CouncilIssue[] {
  const expected = computeCouncilLedgerHash(record);
  return record.contentHash === expected ? [] : [{
    severity: "error",
    code: "invalid_content_hash",
    target: `${target}.contentHash`,
    message: `contentHash不一致 expected=${expected} actual=${record.contentHash}`,
  }];
}

export function validateDissentRecord(
  value: unknown,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
  target = "CouncilDissentRecord",
): CouncilIssue[] {
  const issues = schemaIssues(value, schema, target);
  if (issues.length > 0) return sortIssues(issues);
  const record = value as CouncilDissentRecord;
  issues.push(...commonPersonaIssues(record, catalog, target), ...hashIssue(record, target));

  if (["oppose", "veto"].includes(record.stance) && record.evidenceRefs.length === 0) {
    issues.push({
      severity: "error",
      code: "dissent_without_evidence",
      target: `${target}.evidenceRefs`,
      message: `${record.stance} dissentにはevidenceRefsが必要です`,
    });
  }
  if (record.stance === "abstain" && record.unresolvedQuestions.length === 0) {
    issues.push({
      severity: "error",
      code: "abstain_without_question",
      target: `${target}.unresolvedQuestions`,
      message: "abstain dissentには未解決質問が必要です",
    });
  }

  const hasResolution =
    record.resolvedAt !== undefined ||
    record.resolutionSummary !== undefined ||
    record.resolutionEvidenceRefs !== undefined;
  if (record.status === "open") {
    if (record.supersedesDissentId || hasResolution) {
      issues.push({
        severity: "error",
        code: "open_dissent_has_revision_fields",
        target,
        message: "open dissentにsupersedes/resolution fieldsを設定できません",
      });
    }
  } else if (!record.supersedesDissentId) {
    issues.push({
      severity: "error",
      code: "dissent_revision_without_parent",
      target: `${target}.supersedesDissentId`,
      message: `${record.status} dissentは直前recordを参照する必要があります`,
    });
  }

  if (record.status === "resolved") {
    if (
      !record.resolvedAt ||
      !record.resolutionSummary ||
      !record.resolutionEvidenceRefs ||
      record.resolutionEvidenceRefs.length === 0
    ) {
      issues.push({
        severity: "error",
        code: "resolved_dissent_without_evidence",
        target,
        message: "resolved dissentにはresolvedAt/summary/evidenceRefsが必要です",
      });
    }
  } else if (hasResolution) {
    issues.push({
      severity: "error",
      code: "unresolved_dissent_has_resolution",
      target,
      message: `${record.status} dissentにresolution fieldsを設定できません`,
    });
  }

  return sortIssues(issues);
}

export function validateVetoRecord(
  value: unknown,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
  target = "CouncilVetoRecord",
): CouncilIssue[] {
  const issues = schemaIssues(value, schema, target);
  if (issues.length > 0) return sortIssues(issues);
  const record = value as CouncilVetoRecord;
  issues.push(...commonPersonaIssues(record, catalog, target), ...hashIssue(record, target));

  const persona = personaMap(catalog).get(record.personaId);
  if (persona && !persona.hardVetoes.includes(record.vetoCode)) {
    issues.push({
      severity: "error",
      code: "veto_outside_jurisdiction",
      target: `${target}.vetoCode`,
      message: `${record.personaId}に登録されていないvetoCodeです: ${record.vetoCode}`,
    });
  }

  const hasClearance =
    record.clearanceMode !== undefined ||
    record.clearedAt !== undefined ||
    record.clearanceEvidenceRefs !== undefined;
  if (record.status === "binding") {
    if (hasClearance) {
      issues.push({
        severity: "error",
        code: "binding_veto_has_clearance",
        target,
        message: "binding vetoにclearance fieldsを設定できません",
      });
    }
  } else if (!record.supersedesVetoId) {
    issues.push({
      severity: "error",
      code: "veto_revision_without_parent",
      target: `${target}.supersedesVetoId`,
      message: `${record.status} vetoは直前recordを参照する必要があります`,
    });
  }

  if (record.status === "cleared") {
    if (
      !record.clearanceMode ||
      !record.clearedAt ||
      !record.clearanceEvidenceRefs ||
      record.clearanceEvidenceRefs.length === 0
    ) {
      issues.push({
        severity: "error",
        code: "cleared_veto_without_evidence",
        target,
        message: "cleared vetoにはmode/clearedAt/evidenceRefsが必要です",
      });
    }
  } else if (hasClearance) {
    issues.push({
      severity: "error",
      code: "uncleared_veto_has_clearance",
      target,
      message: `${record.status} vetoにclearance fieldsを設定できません`,
    });
  }

  return sortIssues(issues);
}

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
  label: string,
): CouncilIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => ({
      severity: "error" as const,
      code,
      target,
      message: `${label}が重複しています: ${value}`,
    }));
}

function assertNoCycle(
  records: Array<{ id: string; parent?: string }>,
  target: string,
): CouncilIssue[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const issues: CouncilIssue[] = [];
  for (const record of records) {
    const seen = new Set<string>();
    let current: { id: string; parent?: string } | undefined = record;
    while (current?.parent) {
      if (seen.has(current.id)) {
        issues.push({
          severity: "error",
          code: "ledger_revision_cycle",
          target,
          message: `revision chainにcycleがあります: ${record.id}`,
        });
        break;
      }
      seen.add(current.id);
      current = byId.get(current.parent);
    }
  }
  return issues;
}

export function validateDissentLedger(
  records: CouncilDissentRecord[],
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): CouncilIssue[] {
  const issues = records.flatMap((record, index) =>
    validateDissentRecord(record, schema, catalog, `dissent[${index}](${record.dissentId})`),
  );
  issues.push(
    ...duplicateIssues(records.map((record) => record.dissentId), "duplicate_dissent_id", "dissent", "dissentId"),
    ...duplicateIssues(records.map((record) => record.contentHash), "duplicate_content_hash", "dissent", "contentHash"),
  );

  const byId = new Map(records.map((record) => [record.dissentId, record]));
  const superseded = new Set<string>();
  for (const record of records) {
    if (!record.supersedesDissentId) continue;
    superseded.add(record.supersedesDissentId);
    const previous = byId.get(record.supersedesDissentId);
    if (!previous) {
      issues.push({
        severity: "error",
        code: "missing_dissent_parent",
        target: record.dissentId,
        message: `supersedesDissentIdが存在しません: ${record.supersedesDissentId}`,
      });
      continue;
    }
    if (
      previous.councilRunId !== record.councilRunId ||
      previous.personaId !== record.personaId ||
      previous.dissentCode !== record.dissentCode ||
      previous.jurisdiction !== record.jurisdiction
    ) {
      issues.push({
        severity: "error",
        code: "dissent_revision_identity_mismatch",
        target: record.dissentId,
        message: "dissent revisionはrun/persona/code/jurisdictionを変更できません",
      });
    }
    if (compareExplicitIso8601Instants(
      record.issuedAt,
      previous.issuedAt,
      "dissent revision issuedAt",
      "previous dissent issuedAt",
    ) <= 0) {
      issues.push({
        severity: "error",
        code: "dissent_revision_time_not_monotonic",
        target: record.dissentId,
        message: "dissent revisionのissuedAtは直前recordより後である必要があります",
      });
    }
    if (
      record.status === "resolved"
      && record.resolvedAt
      && compareExplicitIso8601Instants(
        record.resolvedAt,
        previous.issuedAt,
        "dissent resolvedAt",
        "previous dissent issuedAt",
      ) < 0
    ) {
      issues.push({
        severity: "error",
        code: "dissent_resolved_before_parent",
        target: record.dissentId,
        message: "resolvedAtは直前dissent issuedAt以後である必要があります",
      });
    }
  }

  issues.push(...assertNoCycle(
    records.map((record) => ({ id: record.dissentId, parent: record.supersedesDissentId })),
    "dissent",
  ));

  const activeHeads = new Map<string, number>();
  for (const record of records.filter((item) => !superseded.has(item.dissentId))) {
    const key = `${record.councilRunId}:${record.personaId}:${record.dissentCode}`;
    activeHeads.set(key, (activeHeads.get(key) ?? 0) + 1);
  }
  for (const [key, count] of activeHeads) {
    if (count > 1) {
      issues.push({
        severity: "error",
        code: "multiple_dissent_heads",
        target: key,
        message: "同一dissent chainに複数のheadがあります",
      });
    }
  }

  return sortIssues(issues);
}

export function validateVetoLedger(
  records: CouncilVetoRecord[],
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): CouncilIssue[] {
  const issues = records.flatMap((record, index) =>
    validateVetoRecord(record, schema, catalog, `veto[${index}](${record.vetoId})`),
  );
  issues.push(
    ...duplicateIssues(records.map((record) => record.vetoId), "duplicate_veto_id", "veto", "vetoId"),
    ...duplicateIssues(records.map((record) => record.contentHash), "duplicate_content_hash", "veto", "contentHash"),
  );

  const byId = new Map(records.map((record) => [record.vetoId, record]));
  const superseded = new Set<string>();
  for (const record of records) {
    if (!record.supersedesVetoId) continue;
    superseded.add(record.supersedesVetoId);
    const previous = byId.get(record.supersedesVetoId);
    if (!previous) {
      issues.push({
        severity: "error",
        code: "missing_veto_parent",
        target: record.vetoId,
        message: `supersedesVetoIdが存在しません: ${record.supersedesVetoId}`,
      });
      continue;
    }
    if (
      previous.councilRunId !== record.councilRunId ||
      previous.personaId !== record.personaId ||
      previous.jurisdiction !== record.jurisdiction ||
      previous.vetoCode !== record.vetoCode ||
      previous.scope !== record.scope
    ) {
      issues.push({
        severity: "error",
        code: "veto_revision_identity_mismatch",
        target: record.vetoId,
        message: "veto revisionはrun/persona/jurisdiction/code/scopeを変更できません",
      });
    }
    if (compareExplicitIso8601Instants(
      record.issuedAt,
      previous.issuedAt,
      "veto revision issuedAt",
      "previous veto issuedAt",
    ) <= 0) {
      issues.push({
        severity: "error",
        code: "veto_revision_time_not_monotonic",
        target: record.vetoId,
        message: "veto revisionのissuedAtは直前recordより後である必要があります",
      });
    }
    if (record.status === "cleared") {
      if (previous.status !== "binding") {
        issues.push({
          severity: "error",
          code: "clearance_parent_not_binding",
          target: record.vetoId,
          message: "cleared vetoはbinding vetoを直接supersedeする必要があります",
        });
      }
      if (
        record.clearedAt
        && compareExplicitIso8601Instants(
          record.clearedAt,
          previous.issuedAt,
          "veto clearedAt",
          "previous veto issuedAt",
        ) < 0
      ) {
        issues.push({
          severity: "error",
          code: "veto_cleared_before_parent",
          target: record.vetoId,
          message: "clearedAtはbinding veto issuedAt以後である必要があります",
        });
      }
      if (record.clearanceMode === "new_evidence" && record.ruleVersion !== previous.ruleVersion) {
        issues.push({
          severity: "error",
          code: "new_evidence_changed_rule_version",
          target: record.vetoId,
          message: "new_evidence clearanceではruleVersionを変更できません",
        });
      }
      if (
        record.clearanceMode === "versioned_rule_correction" &&
        record.ruleVersion === previous.ruleVersion
      ) {
        issues.push({
          severity: "error",
          code: "rule_correction_without_new_version",
          target: record.vetoId,
          message: "versioned_rule_correctionには新しいruleVersionが必要です",
        });
      }
    }
  }

  issues.push(...assertNoCycle(
    records.map((record) => ({ id: record.vetoId, parent: record.supersedesVetoId })),
    "veto",
  ));

  const activeHeads = new Map<string, CouncilVetoRecord[]>();
  for (const record of records.filter((item) => !superseded.has(item.vetoId))) {
    const key = `${record.councilRunId}:${record.personaId}:${record.vetoCode}:${record.scope}`;
    const group = activeHeads.get(key) ?? [];
    group.push(record);
    activeHeads.set(key, group);
  }
  for (const [key, group] of activeHeads) {
    if (group.length > 1) {
      issues.push({
        severity: "error",
        code: "multiple_veto_heads",
        target: key,
        message: "同一veto chainに複数のheadがあります",
      });
    }
  }

  return sortIssues(issues);
}

export function parseCouncilLedgerJsonl<T>(content: string, sourceName: string): T[] {
  const records: T[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}: ${(error as Error).message}`);
    }
  }
  return records;
}

function readLedger<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseCouncilLedgerJsonl<T>(content, path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`ledger lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

function appendLedger<T>(
  path: string,
  incoming: T[],
  ownerToken: string,
  validateAll: (records: T[]) => CouncilIssue[],
): void {
  if (incoming.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`council ledger lock is already held: ${lockPath}`);
    }
    throw error;
  }

  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existing = readLedger<T>(path);
    const issues = validateAll([...existing, ...incoming])
      .filter((issue) => issue.severity === "error");
    if (issues.length > 0) {
      throw new Error(issues.map((issue) => `${issue.code} ${issue.target}: ${issue.message}`).join("\n"));
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

export function appendDissentRecords(
  path: string,
  incoming: CouncilDissentRecord[],
  ownerToken: string,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): void {
  appendLedger(path, incoming, ownerToken, (records) => validateDissentLedger(records, schema, catalog));
}

export function appendVetoRecords(
  path: string,
  incoming: CouncilVetoRecord[],
  ownerToken: string,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
): void {
  appendLedger(path, incoming, ownerToken, (records) => validateVetoLedger(records, schema, catalog));
}

export function validateRepositoryCouncilLedgers(): {
  dissentIssues: CouncilIssue[];
  vetoIssues: CouncilIssue[];
  dissentCount: number;
  vetoCount: number;
} {
  const catalog = loadCouncilYaml(STOCK_PRO_COUNCIL_V2_PATHS.catalog) as StockProCouncilV2Catalog;
  const dissentSchema = loadCouncilSchema(COUNCIL_LEDGER_PATHS.dissentSchema);
  const vetoSchema = loadCouncilSchema(COUNCIL_LEDGER_PATHS.vetoSchema);
  let dissent: CouncilDissentRecord[] = [];
  let veto: CouncilVetoRecord[] = [];
  const dissentIssues: CouncilIssue[] = [];
  const vetoIssues: CouncilIssue[] = [];

  try {
    dissent = readLedger<CouncilDissentRecord>(COUNCIL_LEDGER_PATHS.dissent);
  } catch (error) {
    dissentIssues.push({
      severity: "error",
      code: "invalid_dissent_ledger",
      target: COUNCIL_LEDGER_PATHS.dissent,
      message: (error as Error).message,
    });
  }
  try {
    veto = readLedger<CouncilVetoRecord>(COUNCIL_LEDGER_PATHS.veto);
  } catch (error) {
    vetoIssues.push({
      severity: "error",
      code: "invalid_veto_ledger",
      target: COUNCIL_LEDGER_PATHS.veto,
      message: (error as Error).message,
    });
  }

  dissentIssues.push(...validateDissentLedger(dissent, dissentSchema, catalog));
  vetoIssues.push(...validateVetoLedger(veto, vetoSchema, catalog));
  return {
    dissentIssues: sortIssues(dissentIssues),
    vetoIssues: sortIssues(vetoIssues),
    dissentCount: dissent.length,
    vetoCount: veto.length,
  };
}