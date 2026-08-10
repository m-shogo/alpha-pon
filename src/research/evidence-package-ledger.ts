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
  parseEvidencePackageJsonl,
  type EvidencePackageIssue,
  type EvidencePackageManifest,
} from "./evidence-package-manifest.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";

export type EvidencePackageValidator = (
  manifest: EvidencePackageManifest,
) => EvidencePackageIssue[];

function issue(
  code: string,
  target: string,
  message: string,
): EvidencePackageIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: EvidencePackageIssue[]): EvidencePackageIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
): EvidencePackageIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

function chainKey(manifest: EvidencePackageManifest): string {
  return [
    manifest.candidateId,
    manifest.listedSecurityEntityId,
    manifest.informationCutoff,
  ].join("|");
}

function detectCycles(
  records: EvidencePackageManifest[],
): EvidencePackageIssue[] {
  const issues: EvidencePackageIssue[] = [];
  const byId = new Map(records.map((record) => [record.packageId, record]));
  for (const record of records) {
    const seen = new Set<string>();
    let current: EvidencePackageManifest | undefined = record;
    while (current?.supersedesPackageId) {
      if (seen.has(current.packageId)) {
        issues.push(issue(
          "evidence_package_revision_cycle",
          record.packageId,
          "Evidence Package supersession chainにcycleがあります",
        ));
        break;
      }
      seen.add(current.packageId);
      current = byId.get(current.supersedesPackageId);
    }
  }
  return issues;
}

export function activeEvidencePackageHeads(
  records: EvidencePackageManifest[],
): EvidencePackageManifest[] {
  const superseded = new Set(
    records.flatMap((record) =>
      record.supersedesPackageId ? [record.supersedesPackageId] : [],
    ),
  );
  return records.filter((record) => !superseded.has(record.packageId));
}

export function validateEvidencePackageLedger(
  records: EvidencePackageManifest[],
): EvidencePackageIssue[] {
  const issues: EvidencePackageIssue[] = [
    ...duplicateIssues(
      records.map((record) => record.packageId),
      "duplicate_evidence_package_id",
      "evidence-packages",
    ),
    ...duplicateIssues(
      records.map((record) => record.contentHash),
      "duplicate_evidence_package_hash",
      "evidence-packages",
    ),
  ];
  const byId = new Map(records.map((record) => [record.packageId, record]));

  for (const record of records) {
    if (record.supersedesPackageId === record.packageId) {
      issues.push(issue(
        "evidence_package_self_supersession",
        record.packageId,
        "package自身をsupersedeできません",
      ));
    }
    if (!record.supersedesPackageId) continue;
    const previous = byId.get(record.supersedesPackageId);
    if (!previous) {
      issues.push(issue(
        "missing_evidence_package_parent",
        record.packageId,
        record.supersedesPackageId,
      ));
      continue;
    }
    if (chainKey(record) !== chainKey(previous)) {
      issues.push(issue(
        "evidence_package_chain_identity_mismatch",
        record.packageId,
        "candidate/listedSecurity/informationCutoffをsupersessionで変更できません",
      ));
    }
    if (!sameStringSet(record.entityIds, previous.entityIds)) {
      issues.push(issue(
        "evidence_package_entity_identity_mismatch",
        record.packageId,
        "entityIdsを同一package chain内で変更できません",
      ));
    }
    if (compareExplicitIso8601Instants(
      record.createdAt,
      previous.createdAt,
      `Evidence Package ${record.packageId}.createdAt`,
      `Evidence Package ${previous.packageId}.createdAt`,
    ) <= 0) {
      issues.push(issue(
        "evidence_package_created_at_not_monotonic",
        record.packageId,
        `${record.createdAt} <= ${previous.createdAt}`,
      ));
    }
  }
  issues.push(...detectCycles(records));

  const heads = activeEvidencePackageHeads(records);
  const headCounts = new Map<string, number>();
  for (const head of heads) {
    const key = chainKey(head);
    headCounts.set(key, (headCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of headCounts) {
    if (count > 1) {
      issues.push(issue(
        "multiple_evidence_package_heads",
        key,
        `${count} active heads`,
      ));
    }
  }
  return sortIssues(issues);
}

function readStrict(path: string): EvidencePackageManifest[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(
      `${path}: final newlineがなくpartial writeの可能性があります`,
    );
  }
  return parseEvidencePackageJsonl(content, path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const ownerPath = `${lockPath}/owner.json`;
  if (!existsSync(ownerPath)) {
    throw new Error(`Evidence Package lock owner metadata is missing: ${ownerPath}`);
  }
  const owner = JSON.parse(readFileSync(ownerPath, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(
      `Evidence Package lock ownership changed; refusing to remove ${lockPath}`,
    );
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendEvidencePackageManifestsGoverned(
  path: string,
  incoming: EvidencePackageManifest[],
  ownerToken: string,
  validateIncoming: EvidencePackageValidator,
): void {
  if (incoming.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Evidence Package lock is already held: ${lockPath}`);
    }
    throw error;
  }

  let ownerWritten = false;
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    ownerWritten = true;
    const existing = readStrict(path);
    const manifestIssues = incoming.flatMap((record) => validateIncoming(record));
    const ledgerIssues = validateEvidencePackageLedger([
      ...existing,
      ...incoming,
    ]);
    const errors = [...manifestIssues, ...ledgerIssues]
      .filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"),
      );
    }

    const fd = openSync(path, "a");
    try {
      appendFileSync(
        fd,
        `${incoming.map((record) => JSON.stringify(record)).join("\n")}\n`,
        "utf-8",
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } finally {
    if (ownerWritten) {
      releaseLock(lockPath, ownerToken);
    } else if (existsSync(lockPath)) {
      rmSync(lockPath, { recursive: true, force: true });
    }
  }
}
