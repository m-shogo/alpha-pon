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
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import {
  parseSecurityMasterJsonl,
  validateSecurityMaster,
  type OfficialLink,
  type SecurityMasterEntityRecord,
  type SecurityMasterIssue,
  type SecurityMasterRelationshipRecord,
  type SecurityMasterSchemas,
} from "./security-master.js";

export type SecurityMasterBatchJournal = {
  schemaVersion: 1;
  ownerToken: string;
  preparedAt: string;
  state: "prepared" | "entities_appended" | "committed";
  entityHashes: string[];
  relationshipHashes: string[];
};

function issue(
  code: string,
  target: string,
  message: string,
  severity: SecurityMasterIssue["severity"] = "error",
): SecurityMasterIssue {
  return { severity, code, target, message };
}

function sortIssues(issues: SecurityMasterIssue[]): SecurityMasterIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function activeEntityHeads(
  records: SecurityMasterEntityRecord[],
): SecurityMasterEntityRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function activeRelationshipHeads(
  records: SecurityMasterRelationshipRecord[],
): SecurityMasterRelationshipRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesRecordId ? [record.supersedesRecordId] : []),
  );
  return records.filter((record) => !superseded.has(record.recordId));
}

function cycleIssues<T extends { recordId: string; supersedesRecordId?: string }>(
  records: T[],
  prefix: string,
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record]));
  for (const record of records) {
    if (record.supersedesRecordId === record.recordId) {
      issues.push(issue(`${prefix}_self_supersession`, record.recordId, "record自身をsupersedeできません"));
    }
    const seen = new Set<string>();
    let current: T | undefined = record;
    while (current?.supersedesRecordId) {
      if (seen.has(current.recordId)) {
        issues.push(issue(`${prefix}_revision_cycle`, record.recordId, "revision chainにcycleがあります"));
        break;
      }
      seen.add(current.recordId);
      current = byId.get(current.supersedesRecordId);
    }
  }
  return issues;
}

function revisionRetrievalChronologyIssues<
  T extends { recordId: string; retrievedAt: string; supersedesRecordId?: string }
>(
  records: T[],
  prefix: "entity" | "relationship",
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const byId = new Map(records.map((record) => [record.recordId, record]));
  for (const record of records) {
    if (!record.supersedesRecordId) continue;
    const previous = byId.get(record.supersedesRecordId);
    if (!previous) continue;
    if (compareExplicitIso8601Instants(
      record.retrievedAt,
      previous.retrievedAt,
      `${prefix} revision ${record.recordId}.retrievedAt`,
      `${prefix} revision ${previous.recordId}.retrievedAt`,
    ) <= 0) {
      issues.push(issue(
        `${prefix}_revision_retrieval_not_monotonic`,
        record.recordId,
        "retrievedAtは直前revisionより後である必要があります",
      ));
    }
  }
  return issues;
}

function rangesOverlap(
  leftFrom: string,
  leftTo: string | undefined,
  rightFrom: string,
  rightTo: string | undefined,
): boolean {
  return leftFrom <= (rightTo ?? "9999-12-31") && rightFrom <= (leftTo ?? "9999-12-31");
}

function validateIssuerUniqueness(
  relationships: SecurityMasterRelationshipRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const issuerRelationships = activeRelationshipHeads(relationships)
    .filter((record) => record.relationshipType === "issuer_of" && record.confidence === "verified");
  const bySecurity = new Map<string, SecurityMasterRelationshipRecord[]>();
  for (const record of issuerRelationships) {
    const group = bySecurity.get(record.toEntityId) ?? [];
    group.push(record);
    bySecurity.set(record.toEntityId, group);
  }
  for (const [securityId, group] of bySecurity) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        if (
          left.fromEntityId !== right.fromEntityId &&
          rangesOverlap(left.validFrom, left.validTo, right.validFrom, right.validTo)
        ) {
          issues.push(issue(
            "overlapping_verified_issuers",
            securityId,
            `${left.fromEntityId} と ${right.fromEntityId} のissuer期間が重複しています`,
          ));
        }
      }
    }
  }
  return issues;
}

function validateOwnershipInverse(
  relationships: SecurityMasterRelationshipRecord[],
): SecurityMasterIssue[] {
  const issues: SecurityMasterIssue[] = [];
  const heads = activeRelationshipHeads(relationships)
    .filter((record) => record.confidence === "verified");
  const parentKeys = new Set(
    heads
      .filter((record) => record.relationshipType === "parent_of")
      .map((record) => `${record.fromEntityId}->${record.toEntityId}:${record.validFrom}:${record.validTo ?? "*"}`),
  );
  for (const record of heads.filter((item) => item.relationshipType === "subsidiary_of")) {
    const inverse = `${record.toEntityId}->${record.fromEntityId}:${record.validFrom}:${record.validTo ?? "*"}`;
    if (!parentKeys.has(inverse)) {
      issues.push(issue(
        "missing_parent_of_inverse",
        record.relationshipId,
        "verified subsidiary_ofには同期間のparent_of inverseが必要です",
      ));
    }
  }
  return issues;
}

export function validateSecurityMasterLifecycle(
  entities: SecurityMasterEntityRecord[],
  relationships: SecurityMasterRelationshipRecord[],
): SecurityMasterIssue[] {
  return sortIssues([
    ...cycleIssues(entities, "entity"),
    ...cycleIssues(relationships, "relationship"),
    ...revisionRetrievalChronologyIssues(entities, "entity"),
    ...revisionRetrievalChronologyIssues(relationships, "relationship"),
    ...validateIssuerUniqueness(relationships),
    ...validateOwnershipInverse(relationships),
  ]);
}

export function validateSecurityMasterGoverned(
  entities: SecurityMasterEntityRecord[],
  relationships: SecurityMasterRelationshipRecord[],
  schemas: SecurityMasterSchemas,
): SecurityMasterIssue[] {
  return sortIssues([
    ...validateSecurityMaster(entities, relationships, schemas),
    ...validateSecurityMasterLifecycle(entities, relationships),
  ]);
}

export function verifiedOfficialLinks(
  entity: SecurityMasterEntityRecord,
  asOf: string,
): OfficialLink[] {
  return entity.officialLinks
    .filter((link) =>
      link.verificationStatus === "verified_official" &&
      link.validFrom <= asOf &&
      (!link.validTo || asOf <= link.validTo),
    )
    .sort((a, b) => `${a.kind}:${a.url}`.localeCompare(`${b.kind}:${b.url}`));
}

function readStrictJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseSecurityMasterJsonl<T>(content, path);
}

function writeJournal(path: string, journal: SecurityMasterBatchJournal): void {
  writeFileSync(path, `${JSON.stringify(journal)}\n`, "utf-8");
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Security Master lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendSecurityMasterRecordsGoverned(
  paths: { entities: string; relationships: string },
  incoming: {
    entities: SecurityMasterEntityRecord[];
    relationships: SecurityMasterRelationshipRecord[];
  },
  ownerToken: string,
  schemas: SecurityMasterSchemas,
): void {
  if (incoming.entities.length === 0 && incoming.relationships.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(paths.entities), { recursive: true });
  mkdirSync(dirname(paths.relationships), { recursive: true });
  const lockPath = `${paths.entities}.security-master.lock`;
  const journalPath = `${paths.entities}.batch-journal.json`;
  if (existsSync(journalPath)) {
    throw new Error(`incomplete_security_master_batch:${journalPath}`);
  }
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Security Master lock is already held: ${lockPath}`);
    }
    throw error;
  }

  let committed = false;
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existingEntities = readStrictJsonl<SecurityMasterEntityRecord>(paths.entities);
    const existingRelationships = readStrictJsonl<SecurityMasterRelationshipRecord>(
      paths.relationships,
    );
    const errors = validateSecurityMasterGoverned(
      [...existingEntities, ...incoming.entities],
      [...existingRelationships, ...incoming.relationships],
      schemas,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }

    const journal: SecurityMasterBatchJournal = {
      schemaVersion: 1,
      ownerToken,
      preparedAt: new Date().toISOString(),
      state: "prepared",
      entityHashes: incoming.entities.map((record) => record.contentHash).sort(),
      relationshipHashes: incoming.relationships.map((record) => record.contentHash).sort(),
    };
    writeJournal(journalPath, journal);

    const append = (path: string, records: unknown[]): void => {
      if (records.length === 0) return;
      const fd = openSync(path, "a");
      try {
        appendFileSync(fd, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    };
    append(paths.entities, incoming.entities);
    writeJournal(journalPath, { ...journal, state: "entities_appended" });
    append(paths.relationships, incoming.relationships);
    writeJournal(journalPath, { ...journal, state: "committed" });
    committed = true;
  } finally {
    if (committed && existsSync(journalPath)) rmSync(journalPath);
    releaseLock(lockPath, ownerToken);
  }
}
