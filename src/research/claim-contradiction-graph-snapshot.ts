import { createHash } from "node:crypto";
import type { GovernedClaimGraphSnapshot } from "./claim-contradiction-graph-hardening.js";
import type { ClaimGraphIssue } from "./claim-contradiction-graph.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export const CLAIM_GRAPH_SNAPSHOT_SCHEMA_PATH =
  "research/schemas/claim-graph-snapshot.schema.json";

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutHash(
  snapshot: GovernedClaimGraphSnapshot,
): Omit<GovernedClaimGraphSnapshot, "contentHash"> {
  const { contentHash: _contentHash, ...input } = snapshot;
  return input;
}

export function computeGovernedClaimGraphSnapshotHash(
  snapshot:
    | GovernedClaimGraphSnapshot
    | Omit<GovernedClaimGraphSnapshot, "contentHash">,
): string {
  return hashValue("contentHash" in snapshot ? withoutHash(snapshot) : snapshot);
}

function canonical(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalArrayIssues(
  values: string[],
  field: string,
): ClaimGraphIssue[] {
  const expected = canonical(values);
  const canonicalOrder =
    expected.length === values.length &&
    expected.every((value, index) => value === values[index]);
  return canonicalOrder ? [] : [{
    severity: "error",
    code: "non_canonical_claim_snapshot_array",
    target: field,
    message: `${field} must be sorted and unique`,
  }];
}

export function validateGovernedClaimGraphSnapshot(
  snapshot: GovernedClaimGraphSnapshot,
  schema: JsonSchema,
): ClaimGraphIssue[] {
  const issues: ClaimGraphIssue[] = validate(snapshot, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path ? `ClaimGraphSnapshot:${error.path}` : "ClaimGraphSnapshot",
    message: error.message,
  }));
  if (issues.length > 0) return issues;

  if (snapshot.contentHash !== computeGovernedClaimGraphSnapshotHash(snapshot)) {
    issues.push({
      severity: "error",
      code: "invalid_claim_snapshot_hash",
      target: "ClaimGraphSnapshot.contentHash",
      message: "governed Claim Graph snapshot hash mismatch",
    });
  }
  issues.push(
    ...canonicalArrayIssues(snapshot.claimIds, "claimIds"),
    ...canonicalArrayIssues(snapshot.edgeIds, "edgeIds"),
    ...canonicalArrayIssues(snapshot.evidenceIds, "evidenceIds"),
  );
  return issues.sort((a, b) =>
    `${a.code}|${a.target}|${a.message}`.localeCompare(`${b.code}|${b.target}|${b.message}`),
  );
}
