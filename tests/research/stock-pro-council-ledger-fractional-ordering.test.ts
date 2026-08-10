import assert from "node:assert/strict";
import {
  COUNCIL_LEDGER_PATHS,
  validateDissentLedger,
  validateVetoLedger,
  withDissentHash,
  withVetoHash,
  type CouncilDissentRecordInput,
  type CouncilVetoRecordInput,
} from "../../src/research/stock-pro-council-ledgers.js";
import {
  STOCK_PRO_COUNCIL_V2_PATHS,
  loadCouncilSchema,
  loadCouncilYaml,
  type StockProCouncilV2Catalog,
} from "../../src/research/stock-pro-council-v2-validation.js";

const catalog = loadCouncilYaml(STOCK_PRO_COUNCIL_V2_PATHS.catalog) as StockProCouncilV2Catalog;
const dissentSchema = loadCouncilSchema(COUNCIL_LEDGER_PATHS.dissentSchema);
const vetoSchema = loadCouncilSchema(COUNCIL_LEDGER_PATHS.vetoSchema);

function dissent(overrides: Partial<CouncilDissentRecordInput> = {}) {
  return withDissentHash({
    schemaVersion: 1,
    dissentId: "dissent-fractional-1",
    dissentCode: "event_already_priced",
    councilRunId: "council-run-fractional",
    personaId: "short_red_team",
    personaVersion: "2",
    issuedAt: "2026-08-06T00:30:00.000000000+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    jurisdiction: "falsification",
    stance: "oppose",
    summary: "fractional ordering test",
    evidenceRefs: ["evidence:fractional"],
    unresolvedQuestions: ["fractional chronology"],
    status: "open",
    ...overrides,
  });
}

function veto(overrides: Partial<CouncilVetoRecordInput> = {}) {
  return withVetoHash({
    schemaVersion: 1,
    vetoId: "veto-fractional-1",
    councilRunId: "council-run-fractional",
    personaId: "data_pit_auditor",
    personaVersion: "2",
    jurisdiction: "provenance",
    vetoCode: "unknown_license",
    scope: "data",
    issuedAt: "2026-08-06T00:30:00.000000000+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    evidenceRefs: ["source-contract:fractional"],
    clearanceRequirements: ["confirm provenance"],
    status: "binding",
    ruleVersion: "data-pit-v1",
    ...overrides,
  });
}

{
  const parent = dissent();
  const child = dissent({
    dissentId: "dissent-fractional-2",
    issuedAt: "2026-08-06T00:30:00.000000001+09:00",
    status: "acknowledged",
    supersedesDissentId: parent.dissentId,
  });
  const issues = validateDissentLedger([parent, child], dissentSchema, catalog);
  assert.ok(!issues.some((issue) => issue.code === "dissent_revision_time_not_monotonic"));
  console.log("stock-pro-council-ledgers: 1ns dissent revision advancement accepted OK");
}

{
  const parent = veto();
  const child = veto({
    vetoId: "veto-fractional-2",
    issuedAt: "2026-08-06T00:30:00.000000001+09:00",
    status: "superseded",
    supersedesVetoId: parent.vetoId,
  });
  const issues = validateVetoLedger([parent, child], vetoSchema, catalog);
  assert.ok(!issues.some((issue) => issue.code === "veto_revision_time_not_monotonic"));
  console.log("stock-pro-council-ledgers: 1ns veto revision advancement accepted OK");
}

{
  const invalid = dissent({
    issuedAt: "2026-08-06T00:30:00.000000000+09:00",
    informationCutoff: "2026-08-06T00:30:00.000000001+09:00",
  });
  const issues = validateDissentLedger([invalid], dissentSchema, catalog);
  assert.ok(issues.some((issue) => issue.code === "issued_before_information_cutoff"));
  console.log("stock-pro-council-ledgers: 1ns pre-cutoff issuance blocked OK");
}

console.log("stock-pro-council-ledger-fractional-ordering.test.ts passed");
