import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCorporateActionClearanceRecords,
  parseCorporateActionClearanceJsonl,
  validateCorporateActionClearanceRecord,
  validateCorporateActionClearanceRecords,
  withCorporateActionClearanceHash,
  type CorporateActionClearanceContext,
  type CorporateActionClearanceRecord,
} from "../../src/research/corporate-action-clearance.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/corporate-action-clearance.schema.json", "utf-8"),
) as JsonSchema;

function context(): CorporateActionClearanceContext {
  return {
    evidenceByRef: new Map([
      ["official:exchange:corporate-actions:001", { tier: "A", observedAt: "2026-08-14T09:00:00+09:00" }],
      ["official:issuer:corporate-actions:001", { tier: "B", observedAt: "2026-08-14T09:05:00+09:00" }],
      ["official:future:001", { tier: "A", observedAt: "2026-08-14T11:00:00+09:00" }],
      ["official:timezone-less:001", { tier: "A", observedAt: "2026-08-14T09:00:00" }],
      ["official:invalid-date:001", { tier: "A", observedAt: "2026-02-29T09:00:00+09:00" }],
    ]),
  };
}

function baseInput(): Omit<CorporateActionClearanceRecord, "contentHash"> {
  return {
    schemaVersion: 1,
    clearanceId: "ca-clearance:8136:2026-08-06:2026-08-12:v1",
    assessedAt: "2026-08-14T10:00:00+09:00",
    assessmentMethod: "official-corporate-action-clearance-v1",
    code: "81360",
    market: "TSE",
    source: "synthetic-outcome-fixture",
    providerPlan: "synthetic",
    fromTradingDate: "2026-08-06",
    throughTradingDate: "2026-08-12",
    status: "clear",
    sourceEvidence: [
      { tier: "A", ref: "official:exchange:corporate-actions:001" },
      { tier: "B", ref: "official:issuer:corporate-actions:001" },
    ],
    notes: ["synthetic fixture only"],
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateCorporateActionClearanceRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withCorporateActionClearanceHash(baseInput());
  assert.deepEqual(validateCorporateActionClearanceRecord(record, schema, context()), []);
  console.log("corporate-action-clearance: evidence-backed clear record passes OK");
}

{
  const input = baseInput();
  input.sourceEvidence = [{ tier: "A", ref: "official:future:001" }];
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("future_evidence"));
  console.log("corporate-action-clearance: post-assessment Evidence is rejected OK");
}

{
  const ref = "official:fractional-future:001";
  const input = baseInput();
  input.assessedAt = "2026-08-14T10:00:00.000000001+09:00";
  input.sourceEvidence = [{ tier: "A", ref }];
  const fractionalContext: CorporateActionClearanceContext = {
    evidenceByRef: new Map([
      ...context().evidenceByRef,
      [ref, { tier: "A", observedAt: "2026-08-14T10:00:00.000000002+09:00" }],
    ]),
  };
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    fractionalContext,
  );
  assert.ok(codes(issues).includes("future_evidence"));
  console.log("corporate-action-clearance: 1ns post-assessment Evidence is rejected OK");
}

{
  const input = baseInput();
  input.sourceEvidence = [{ tier: "A", ref: "official:timezone-less:001" }];
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("invalid_evidence_observed_at"));
  console.log("corporate-action-clearance: timezone-less context Evidence is rejected OK");
}

{
  const input = baseInput();
  input.sourceEvidence = [{ tier: "A", ref: "official:invalid-date:001" }];
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("invalid_evidence_observed_at"));
  console.log("corporate-action-clearance: non-Gregorian context Evidence is rejected OK");
}

{
  const input = baseInput();
  input.sourceEvidence = [{ tier: "A", ref: "https://example.invalid/actions?token=secret" }];
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("secret_like_evidence_ref"));
  console.log("corporate-action-clearance: secret-like Evidence ref is rejected OK");
}

{
  const input = baseInput();
  input.sourceEvidence = [{ tier: "A", ref: "https://user:password@example.invalid/actions" }];
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("secret_like_evidence_ref"));
  console.log("corporate-action-clearance: URL userinfo credentials are rejected OK");
}

{
  const input = baseInput();
  input.sourceEvidence = [{ tier: "A", ref: "https://example.invalid/actions#token=secret" }];
  const issues = validateCorporateActionClearanceRecord(
    withCorporateActionClearanceHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("secret_like_evidence_ref"));
  console.log("corporate-action-clearance: URL fragment credentials are rejected OK");
}

{
  const invalidTier = {
    ...baseInput(),
    sourceEvidence: [{ tier: "C", ref: "discovery:news:001" }],
  };
  const record = {
    ...invalidTier,
    contentHash: "a".repeat(64),
  };
  const issues = validateCorporateActionClearanceRecord(record, schema, context());
  assert.ok(codes(issues).includes("schema_violation"));
  console.log("corporate-action-clearance: Tier C discovery evidence is structurally rejected OK");
}

{
  const root = withCorporateActionClearanceHash(baseInput());
  const revisionInput = baseInput();
  revisionInput.clearanceId = "ca-clearance:8136:2026-08-06:2026-08-20:v2";
  revisionInput.supersedesClearanceId = root.clearanceId;
  revisionInput.assessedAt = "2026-08-21T10:00:00+09:00";
  revisionInput.throughTradingDate = "2026-08-20";
  const revision = withCorporateActionClearanceHash(revisionInput);
  assert.deepEqual(validateCorporateActionClearanceRecords([root, revision], schema, context()), []);

  const forkInput = {
    ...revisionInput,
    clearanceId: "ca-clearance:8136:2026-08-06:2026-08-21:fork",
    throughTradingDate: "2026-08-21",
  };
  const fork = withCorporateActionClearanceHash(forkInput);
  const forkIssues = validateCorporateActionClearanceRecords([root, revision, fork], schema, context());
  assert.ok(forkIssues.some((candidate) => candidate.code === "clearance_revision_fork"));
  console.log("corporate-action-clearance: linear extension passes and revision fork is rejected OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-ca-clearance-"));
  const path = join(sandbox, "clearances.jsonl");
  appendCorporateActionClearanceRecords({ path, incoming: [root], schema, context: context() });
  appendCorporateActionClearanceRecords({ path, incoming: [revision], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseCorporateActionClearanceJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendCorporateActionClearanceRecords({ path, incoming: [fork], schema, context: context() }),
    /clearance_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("corporate-action-clearance: rejected append keeps prior history byte-for-byte unchanged OK");
}

{
  const rootInput = baseInput();
  rootInput.clearanceId = "ca-clearance:fractional:v1";
  rootInput.assessedAt = "2026-08-14T10:00:00.000000001+09:00";
  const root = withCorporateActionClearanceHash(rootInput);
  const revisionInput = baseInput();
  revisionInput.clearanceId = "ca-clearance:fractional:v2";
  revisionInput.assessedAt = "2026-08-14T10:00:00.000000002+09:00";
  revisionInput.supersedesClearanceId = root.clearanceId;
  const revision = withCorporateActionClearanceHash(revisionInput);
  const issues = validateCorporateActionClearanceRecords([root, revision], schema, context());
  assert.ok(!issues.some((candidate) => candidate.code === "clearance_assessed_at_not_monotonic"));
  console.log("corporate-action-clearance: 1ns revision progression remains chronologically valid OK");
}

console.log("corporate-action-clearance.test.ts passed");
