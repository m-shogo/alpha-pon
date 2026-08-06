import assert from "node:assert/strict";
import {
  loadCouncilSchema,
  loadCouncilYaml,
  validatePersonaVerdict,
  validateStockProCouncilV2Catalog,
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "../../src/research/stock-pro-council-v2-validation.js";

const catalogPath = "research/personas/stock-pro-council-v2.yml";
const catalogSchemaPath = "research/schemas/stock-pro-council-v2.schema.json";
const verdictSchemaPath = "research/schemas/persona-verdict.schema.json";

const catalogSchema = loadCouncilSchema(catalogSchemaPath);
const verdictSchema = loadCouncilSchema(verdictSchemaPath);
const catalog = loadCouncilYaml(catalogPath) as StockProCouncilV2Catalog;

function errorCodes(issues: ReturnType<typeof validateStockProCouncilV2Catalog>): string[] {
  return issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
}

function verdict(overrides: Partial<PersonaVerdict> = {}): PersonaVerdict {
  return {
    schemaVersion: 1,
    personaId: "jp_event_driven_pm",
    personaVersion: "2",
    runId: "council-run-001",
    issuedAt: "2026-08-06T00:20:00+09:00",
    informationCutoff: "2026-08-06T00:15:00+09:00",
    jurisdiction: "event_state_transition",
    stance: "support",
    decisionView: "WATCH",
    evidenceRefs: ["evidence:tdnet:sample:1"],
    facts: ["正式開示が公表された"],
    assumptions: ["市場参加者の再評価には時間差がある"],
    forecasts: ["次の営業日に出来高が増える可能性がある"],
    risks: ["既に価格へ織り込まれている可能性"],
    missingEvidence: [],
    vetoCodes: [],
    falsificationConditions: ["出来高と相対リターンが発生しない"],
    nextEvidenceActions: ["PIT価格と訂正履歴を確認する"],
    modelVersion: "fixture-model-v1",
    ...overrides,
  };
}

{
  const issues = validateStockProCouncilV2Catalog(catalog, catalogSchema);
  assert.deepEqual(issues.filter((issue) => issue.severity === "error"), []);
  console.log("stock-pro-council-v2: repository catalog OK");
}

{
  const duplicate = structuredClone(catalog);
  duplicate.personas[1].id = duplicate.personas[0].id;
  assert.ok(errorCodes(validateStockProCouncilV2Catalog(duplicate, catalogSchema))
    .includes("duplicate_persona_id"));

  const missing = structuredClone(catalog);
  missing.personas = missing.personas.filter((persona) => persona.id !== "data_pit_auditor");
  assert.ok(errorCodes(validateStockProCouncilV2Catalog(missing, catalogSchema))
    .includes("missing_core_persona"));

  const abstainingAuditor = structuredClone(catalog);
  const auditor = abstainingAuditor.personas.find((persona) => persona.id === "data_pit_auditor");
  assert.ok(auditor);
  auditor.abstainWhen = ["source_missing"];
  assert.ok(errorCodes(validateStockProCouncilV2Catalog(abstainingAuditor, catalogSchema))
    .includes("data_auditor_may_not_abstain"));

  const premature = structuredClone(catalog);
  premature.activationGate.deterministicReplayImplemented = true;
  assert.ok(errorCodes(validateStockProCouncilV2Catalog(premature, catalogSchema))
    .includes("premature_council_gate"));
  console.log("stock-pro-council-v2: catalog semantic guards OK");
}

{
  assert.deepEqual(
    validatePersonaVerdict(verdict(), verdictSchema, catalog)
      .filter((issue) => issue.severity === "error"),
    [],
  );

  assert.ok(validatePersonaVerdict(
    verdict({ personaId: "unknown_persona" }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "unknown_persona"));

  assert.ok(validatePersonaVerdict(
    verdict({ jurisdiction: "accounting_quality" }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "jurisdiction_violation"));

  assert.ok(validatePersonaVerdict(
    verdict({ issuedAt: "2026-08-06T00:10:00+09:00" }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "issued_before_information_cutoff"));
  console.log("stock-pro-council-v2: persona identity/PIT guards OK");
}

{
  assert.ok(validatePersonaVerdict(
    verdict({ stance: "veto", decisionView: "AVOID", vetoCodes: [] }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "veto_without_code"));

  assert.ok(validatePersonaVerdict(
    verdict({
      stance: "veto",
      decisionView: "AVOID",
      vetoCodes: ["unregistered_veto"],
    }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "veto_outside_jurisdiction"));

  assert.ok(validatePersonaVerdict(
    verdict({ stance: "support", vetoCodes: ["pit_leakage"] }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "veto_code_without_veto_stance"));

  const validVeto = verdict({
    stance: "veto",
    decisionView: "AVOID",
    vetoCodes: ["pit_leakage"],
  });
  assert.deepEqual(
    validatePersonaVerdict(validVeto, verdictSchema, catalog)
      .filter((issue) => issue.severity === "error"),
    [],
  );
  console.log("stock-pro-council-v2: jurisdictional veto guards OK");
}

{
  assert.ok(validatePersonaVerdict(
    verdict({
      stance: "abstain",
      decisionView: "WAIT",
      evidenceRefs: [],
      missingEvidence: ["市場カレンダー未接続"],
      nextEvidenceActions: ["市場カレンダーを確認する"],
    }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "abstain_with_decision"));

  assert.ok(validatePersonaVerdict(
    verdict({ confidence: 0.8 }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "confidence_without_calibration"));

  const calibrated = verdict({ confidence: 0.6, calibrationRef: "calibration:event:v1" });
  assert.equal(validatePersonaVerdict(calibrated, verdictSchema, catalog)
    .some((issue) => issue.severity === "error"), false);
  console.log("stock-pro-council-v2: abstain/calibration guards OK");
}

{
  const duplicatedClaim = "これは重複分類された主張";
  assert.ok(validatePersonaVerdict(
    verdict({ facts: [duplicatedClaim], assumptions: [duplicatedClaim] }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "claim_category_overlap"));

  assert.ok(validatePersonaVerdict(
    verdict({ stance: "oppose", decisionView: "BUY" }),
    verdictSchema,
    catalog,
  ).some((issue) => issue.code === "buy_conflicts_with_stance"));
  console.log("stock-pro-council-v2: claim separation/BUY conflict guards OK");
}

console.log("stock-pro-council-v2: 全テスト成功");
