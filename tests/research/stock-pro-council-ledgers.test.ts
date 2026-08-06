import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendDissentRecords,
  appendVetoRecords,
  validateDissentLedger,
  validateVetoLedger,
  withDissentHash,
  withVetoHash,
  type CouncilDissentRecord,
  type CouncilDissentRecordInput,
  type CouncilVetoRecord,
  type CouncilVetoRecordInput,
} from "../../src/research/stock-pro-council-ledgers.js";
import {
  loadCouncilSchema,
  loadCouncilYaml,
  type StockProCouncilV2Catalog,
} from "../../src/research/stock-pro-council-v2-validation.js";

const catalog = loadCouncilYaml(
  "research/personas/stock-pro-council-v2.yml",
) as StockProCouncilV2Catalog;
const dissentSchema = loadCouncilSchema(
  "research/schemas/council-dissent-record.schema.json",
);
const vetoSchema = loadCouncilSchema(
  "research/schemas/council-veto-record.schema.json",
);

function dissent(overrides: Partial<CouncilDissentRecordInput> = {}): CouncilDissentRecord {
  return withDissentHash({
    schemaVersion: 1,
    dissentId: "dissent-001",
    dissentCode: "event_already_priced",
    councilRunId: "council-run-001",
    personaId: "short_red_team",
    personaVersion: "2",
    issuedAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    jurisdiction: "falsification",
    stance: "oppose",
    summary: "材料は既に価格へ織り込まれている可能性が高い",
    evidenceRefs: ["evidence:price-reaction:001"],
    unresolvedQuestions: ["同業他社に同じ反応があるか"],
    status: "open",
    ...overrides,
  });
}

function veto(overrides: Partial<CouncilVetoRecordInput> = {}): CouncilVetoRecord {
  return withVetoHash({
    schemaVersion: 1,
    vetoId: "veto-001",
    councilRunId: "council-run-001",
    personaId: "data_pit_auditor",
    personaVersion: "2",
    jurisdiction: "provenance",
    vetoCode: "unknown_license",
    scope: "data",
    issuedAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    evidenceRefs: ["source-contract:unknown:001"],
    clearanceRequirements: ["保存権と利用権を一次契約で確認する"],
    status: "binding",
    ruleVersion: "data-pit-v1",
    ...overrides,
  });
}

{
  const open = dissent();
  const resolved = dissent({
    dissentId: "dissent-002",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "resolved",
    supersedesDissentId: open.dissentId,
    resolvedAt: "2026-08-06T01:00:00+09:00",
    resolutionSummary: "同業比較で固有の織込みではないことを確認した",
    resolutionEvidenceRefs: ["evidence:matched-control:001"],
  });
  assert.deepEqual(
    validateDissentLedger([open, resolved], dissentSchema, catalog)
      .filter((issue) => issue.severity === "error"),
    [],
  );

  const tampered = { ...open, summary: "改ざんされた要約" };
  assert.ok(validateDissentLedger([tampered], dissentSchema, catalog)
    .some((issue) => issue.code === "invalid_content_hash"));

  const secondHead = dissent({ dissentId: "dissent-003" });
  assert.ok(validateDissentLedger([open, secondHead], dissentSchema, catalog)
    .some((issue) => issue.code === "multiple_dissent_heads"));
  console.log("stock-pro-council-ledgers: dissent append/revision guards OK");
}

{
  const binding = veto();
  const cleared = veto({
    vetoId: "veto-002",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T01:00:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed:001"],
    ruleVersion: "data-pit-v1",
  });
  assert.deepEqual(
    validateVetoLedger([binding, cleared], vetoSchema, catalog)
      .filter((issue) => issue.severity === "error"),
    [],
  );

  const changedRuleUnderEvidence = veto({
    vetoId: "veto-003",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T01:00:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed:001"],
    ruleVersion: "data-pit-v2",
  });
  assert.ok(validateVetoLedger([binding, changedRuleUnderEvidence], vetoSchema, catalog)
    .some((issue) => issue.code === "new_evidence_changed_rule_version"));

  const unversionedCorrection = veto({
    vetoId: "veto-004",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "versioned_rule_correction",
    clearedAt: "2026-08-06T01:00:00+09:00",
    clearanceEvidenceRefs: ["rule-review:001"],
    ruleVersion: "data-pit-v1",
  });
  assert.ok(validateVetoLedger([binding, unversionedCorrection], vetoSchema, catalog)
    .some((issue) => issue.code === "rule_correction_without_new_version"));
  console.log("stock-pro-council-ledgers: veto clearance mode guards OK");
}

{
  const binding = veto();
  const cioClearance = veto({
    vetoId: "veto-cio-clearance",
    personaId: "cio_synthesizer",
    jurisdiction: "final_record_assembly",
    vetoCode: "unresolved_binding_veto",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T01:00:00+09:00",
    clearanceEvidenceRefs: ["cio:narrative:001"],
    ruleVersion: "data-pit-v1",
  });
  assert.ok(validateVetoLedger([binding, cioClearance], vetoSchema, catalog)
    .some((issue) => issue.code === "veto_revision_identity_mismatch"));
  console.log("stock-pro-council-ledgers: CIO cannot clear foreign veto OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "council-ledgers-"));
  const dissentPath = join(dir, "dissent.jsonl");
  const vetoPath = join(dir, "veto.jsonl");
  try {
    appendDissentRecords(dissentPath, [dissent()], "dissent-owner", dissentSchema, catalog);
    appendVetoRecords(vetoPath, [veto()], "veto-owner", vetoSchema, catalog);
    assert.equal(readFileSync(dissentPath, "utf-8").trim().split("\n").length, 1);
    assert.equal(readFileSync(vetoPath, "utf-8").trim().split("\n").length, 1);

    assert.throws(
      () => appendVetoRecords(
        vetoPath,
        [{ ...veto({ vetoId: "veto-invalid" }), contentHash: "0".repeat(64) }],
        "invalid-owner",
        vetoSchema,
        catalog,
      ),
      /invalid_content_hash/,
    );
    assert.equal(existsSync(`${vetoPath}.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-ledgers: single-writer append/fsync guards OK");
}

console.log("stock-pro-council-ledgers: 全テスト成功");
