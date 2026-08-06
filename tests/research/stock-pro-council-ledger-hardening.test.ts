import assert from "node:assert/strict";
import {
  validateCouncilLedgerLifecycle,
} from "../../src/research/stock-pro-council-ledger-hardening.js";
import {
  withDissentHash,
  withVetoHash,
  type CouncilDissentRecord,
  type CouncilDissentRecordInput,
  type CouncilVetoRecord,
  type CouncilVetoRecordInput,
} from "../../src/research/stock-pro-council-ledgers.js";

function dissent(overrides: Partial<CouncilDissentRecordInput> = {}): CouncilDissentRecord {
  return withDissentHash({
    schemaVersion: 1,
    dissentId: "dissent-hardening-001",
    dissentCode: "event_already_priced",
    councilRunId: "council-run-hardening",
    personaId: "short_red_team",
    personaVersion: "2",
    issuedAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    jurisdiction: "falsification",
    stance: "oppose",
    summary: "材料が既に価格へ織り込まれている可能性を確認する",
    evidenceRefs: ["evidence:price-reaction:hardening"],
    unresolvedQuestions: ["matched controlでも同じ反応か"],
    status: "open",
    ...overrides,
  });
}

function veto(overrides: Partial<CouncilVetoRecordInput> = {}): CouncilVetoRecord {
  return withVetoHash({
    schemaVersion: 1,
    vetoId: "veto-hardening-001",
    councilRunId: "council-run-hardening",
    personaId: "data_pit_auditor",
    personaVersion: "2",
    jurisdiction: "provenance",
    vetoCode: "unknown_license",
    scope: "data",
    issuedAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    evidenceRefs: ["source-contract:unknown:hardening"],
    clearanceRequirements: ["保存権と利用権を一次契約で確認する"],
    status: "binding",
    ruleVersion: "data-pit-v1",
    ...overrides,
  });
}

{
  const open = dissent();
  const resolved = dissent({
    dissentId: "dissent-hardening-002",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "resolved",
    supersedesDissentId: open.dissentId,
    resolvedAt: "2026-08-06T00:59:00+09:00",
    resolutionSummary: "matched controlで反証を確認した",
    resolutionEvidenceRefs: ["matched-control:hardening"],
  });
  assert.ok(validateCouncilLedgerLifecycle([open, resolved], [])
    .some((issue) => issue.code === "dissent_resolved_before_revision"));

  const cutoffRegression = dissent({
    dissentId: "dissent-hardening-003",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:20:00+09:00",
    status: "acknowledged",
    supersedesDissentId: open.dissentId,
  });
  assert.ok(validateCouncilLedgerLifecycle([open, cutoffRegression], [])
    .some((issue) => issue.code === "dissent_cutoff_regression"));
  console.log("stock-pro-council-ledger-hardening: dissent time/cutoff guards OK");
}

{
  const open = dissent();
  const resolved = dissent({
    dissentId: "dissent-hardening-004",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "resolved",
    supersedesDissentId: open.dissentId,
    resolvedAt: "2026-08-06T01:00:00+09:00",
    resolutionSummary: "解決済み",
    resolutionEvidenceRefs: ["evidence:resolution:hardening"],
  });
  const reopened = dissent({
    dissentId: "dissent-hardening-005",
    issuedAt: "2026-08-06T01:30:00+09:00",
    informationCutoff: "2026-08-06T01:25:00+09:00",
    status: "acknowledged",
    supersedesDissentId: resolved.dissentId,
  });
  assert.ok(validateCouncilLedgerLifecycle([open, resolved, reopened], [])
    .some((issue) => issue.code === "invalid_dissent_status_transition"));
  console.log("stock-pro-council-ledger-hardening: dissent terminal transition guard OK");
}

{
  const binding = veto();
  const cleared = veto({
    vetoId: "veto-hardening-002",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T00:59:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed:hardening"],
    ruleVersion: "data-pit-v1",
  });
  assert.ok(validateCouncilLedgerLifecycle([], [binding, cleared])
    .some((issue) => issue.code === "veto_cleared_before_revision"));

  const cutoffRegression = veto({
    vetoId: "veto-hardening-003",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:20:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T01:00:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed:hardening"],
    ruleVersion: "data-pit-v1",
  });
  assert.ok(validateCouncilLedgerLifecycle([], [binding, cutoffRegression])
    .some((issue) => issue.code === "veto_cutoff_regression"));
  console.log("stock-pro-council-ledger-hardening: veto time/cutoff guards OK");
}

{
  const binding = veto();
  const cleared = veto({
    vetoId: "veto-hardening-004",
    issuedAt: "2026-08-06T01:00:00+09:00",
    informationCutoff: "2026-08-06T00:55:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T01:00:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed:hardening"],
    ruleVersion: "data-pit-v1",
  });
  const clearedAgain = veto({
    vetoId: "veto-hardening-005",
    issuedAt: "2026-08-06T01:30:00+09:00",
    informationCutoff: "2026-08-06T01:25:00+09:00",
    status: "cleared",
    supersedesVetoId: cleared.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T01:30:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed-again:hardening"],
    ruleVersion: "data-pit-v1",
  });
  assert.ok(validateCouncilLedgerLifecycle([], [binding, cleared, clearedAgain])
    .some((issue) => issue.code === "invalid_veto_status_transition"));
  console.log("stock-pro-council-ledger-hardening: veto terminal transition guard OK");
}

console.log("stock-pro-council-ledger-hardening: 全テスト成功");
