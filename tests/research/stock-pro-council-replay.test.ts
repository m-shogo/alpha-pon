import assert from "node:assert/strict";
import {
  buildCouncilReplayResult,
  hashPersonaVerdict,
  requiredPersonaIdsForCase,
  validateCouncilReplayPackage,
  withReplayManifestHash,
  type CouncilCaseType,
  type CouncilReplayPackage,
  type CouncilReplaySchemas,
} from "../../src/research/stock-pro-council-replay.js";
import {
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
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "../../src/research/stock-pro-council-v2-validation.js";

const catalog = loadCouncilYaml(
  "research/personas/stock-pro-council-v2.yml",
) as StockProCouncilV2Catalog;
const schemas: CouncilReplaySchemas = {
  manifest: loadCouncilSchema("research/schemas/council-replay-manifest.schema.json"),
  result: loadCouncilSchema("research/schemas/council-replay-result.schema.json"),
  verdict: loadCouncilSchema("research/schemas/persona-verdict.schema.json"),
  dissent: loadCouncilSchema("research/schemas/council-dissent-record.schema.json"),
  veto: loadCouncilSchema("research/schemas/council-veto-record.schema.json"),
};

const RUN_ID = "council-replay-run-001";
const CUTOFF = "2026-08-06T00:25:00+09:00";
const CREATED_AT = "2026-08-06T01:00:00+09:00";

const JURISDICTION: Record<string, string> = {
  jp_event_driven_pm: "event_state_transition",
  forensic_governance_analyst: "accounting_quality",
  industry_supply_chain_analyst: "beneficiary_mapping",
  valuation_expectations_analyst: "valuation",
  market_execution_specialist: "executable_price",
  quant_causal_validator: "pit_and_sample_integrity",
  short_red_team: "falsification",
  portfolio_risk_allocator: "concentration",
  data_pit_auditor: "provenance",
  personal_suitability_adviser: "user_constraints",
  cio_synthesizer: "final_record_assembly",
};

function verdict(
  personaId: string,
  overrides: Partial<PersonaVerdict> = {},
): PersonaVerdict {
  return {
    schemaVersion: 1,
    personaId,
    personaVersion: "2",
    runId: RUN_ID,
    issuedAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: CUTOFF,
    jurisdiction: JURISDICTION[personaId],
    stance: "support",
    decisionView: "WATCH",
    evidenceRefs: [`evidence:${personaId}:001`],
    facts: [`fact:${personaId}:001`],
    assumptions: [`assumption:${personaId}:001`],
    forecasts: [`forecast:${personaId}:001`],
    risks: [`risk:${personaId}:001`],
    missingEvidence: [],
    vetoCodes: [],
    falsificationConditions: [`falsification:${personaId}:001`],
    nextEvidenceActions: [`next:${personaId}:001`],
    modelVersion: "fixture-model-v1",
    ...overrides,
  };
}

function dissent(
  personaId: string,
  overrides: Partial<CouncilDissentRecordInput> = {},
): CouncilDissentRecord {
  return withDissentHash({
    schemaVersion: 1,
    dissentId: `dissent-${personaId}-001`,
    dissentCode: "decision_disagreement",
    councilRunId: RUN_ID,
    personaId,
    personaVersion: "2",
    issuedAt: "2026-08-06T00:31:00+09:00",
    informationCutoff: CUTOFF,
    jurisdiction: JURISDICTION[personaId],
    stance: "oppose",
    summary: `${personaId}の反対意見を保存する`,
    evidenceRefs: [`evidence:dissent:${personaId}:001`],
    unresolvedQuestions: [`question:${personaId}:001`],
    status: "open",
    ...overrides,
  });
}

function veto(
  overrides: Partial<CouncilVetoRecordInput> = {},
): CouncilVetoRecord {
  return withVetoHash({
    schemaVersion: 1,
    vetoId: "veto-data-pit-001",
    councilRunId: RUN_ID,
    personaId: "data_pit_auditor",
    personaVersion: "2",
    jurisdiction: "provenance",
    vetoCode: "unknown_license",
    scope: "data",
    issuedAt: "2026-08-06T00:32:00+09:00",
    informationCutoff: CUTOFF,
    evidenceRefs: ["source-contract:unknown:replay"],
    clearanceRequirements: ["保存権と利用権を一次契約で確認する"],
    status: "binding",
    ruleVersion: "data-pit-v1",
    ...overrides,
  });
}

function makePackage(
  caseType: CouncilCaseType,
  verdicts: PersonaVerdict[],
  dissentRecords: CouncilDissentRecord[] = [],
  vetoRecords: CouncilVetoRecord[] = [],
  createdAt = CREATED_AT,
): CouncilReplayPackage {
  const manifest = withReplayManifestHash({
    schemaVersion: 1,
    replayId: `replay-${caseType}-001`,
    councilRunId: RUN_ID,
    caseType,
    informationCutoff: CUTOFF,
    createdAt,
    evidencePackageHash: "a".repeat(64),
    priceSnapshotHash: "b".repeat(64),
    codeVersion: "fixture-code-v1",
    ruleVersion: "council-firewall-v1",
    personaCatalogVersion: "2",
    requiredPersonaIds: requiredPersonaIdsForCase(caseType),
    verdictHashes: verdicts.map(hashPersonaVerdict),
    dissentHashes: dissentRecords.map((record) => record.contentHash),
    vetoHashes: vetoRecords.map((record) => record.contentHash),
    calibrationHashes: [],
    automaticTradingAuthorized: false,
  });
  return { manifest, verdicts, dissent: dissentRecords, veto: vetoRecords };
}

function supportedPackage(caseType: CouncilCaseType = "general"): CouncilReplayPackage {
  return makePackage(
    caseType,
    requiredPersonaIdsForCase(caseType).map((personaId) => verdict(personaId)),
  );
}

{
  const pkg = supportedPackage();
  const result1 = buildCouncilReplayResult(pkg, schemas, catalog);
  const result2 = buildCouncilReplayResult(pkg, schemas, catalog);
  assert.equal(result1.eligibleForRecommendationCandidate, true);
  assert.deepEqual(result1.blockers, []);
  assert.equal(result1.resultHash, result2.resultHash);
  assert.equal(result1.automaticTradingAuthorized, false);
  console.log("stock-pro-council-replay: deterministic eligible package OK");
}

{
  const required = requiredPersonaIdsForCase("general");
  const verdicts = required.map((personaId) => personaId === "data_pit_auditor"
    ? verdict(personaId, {
      stance: "veto",
      decisionView: "AVOID",
      vetoCodes: ["unknown_license"],
    })
    : verdict(personaId));
  const dissentRecord = dissent("data_pit_auditor", {
    dissentCode: "unknown_license",
    stance: "veto",
  });
  const vetoRecord = veto();
  const result = buildCouncilReplayResult(
    makePackage("general", verdicts, [dissentRecord], [vetoRecord]),
    schemas,
    catalog,
  );
  assert.equal(result.eligibleForRecommendationCandidate, false);
  assert.ok(result.blockers.includes("required_persona_veto:data_pit_auditor"));
  assert.ok(result.blockers.includes(`binding_veto:${vetoRecord.vetoId}`));
  assert.equal(verdicts.filter((item) => item.stance === "support").length, required.length - 1);
  console.log("stock-pro-council-replay: majority cannot override PIT veto OK");
}

{
  const required = requiredPersonaIdsForCase("general");
  const verdicts = required
    .filter((personaId) => personaId !== "portfolio_risk_allocator")
    .map((personaId) => verdict(personaId));
  const result = buildCouncilReplayResult(
    makePackage("general", verdicts),
    schemas,
    catalog,
  );
  assert.equal(result.eligibleForRecommendationCandidate, false);
  assert.ok(result.blockers.includes("missing_required_persona:portfolio_risk_allocator"));
  console.log("stock-pro-council-replay: missing required persona block OK");
}

{
  const required = requiredPersonaIdsForCase("general");
  const verdicts = required.map((personaId) => personaId === "portfolio_risk_allocator"
    ? verdict(personaId, {
      stance: "abstain",
      decisionView: undefined,
      evidenceRefs: [],
      facts: [],
      assumptions: [],
      forecasts: [],
      missingEvidence: ["current_portfolioが未取得"],
      nextEvidenceActions: ["current_portfolioを取得する"],
    })
    : verdict(personaId));
  const dissentRecord = dissent("portfolio_risk_allocator", {
    dissentCode: "portfolio_unknown",
    stance: "abstain",
    evidenceRefs: [],
  });
  const result = buildCouncilReplayResult(
    makePackage("general", verdicts, [dissentRecord]),
    schemas,
    catalog,
  );
  assert.equal(result.eligibleForRecommendationCandidate, false);
  assert.ok(result.blockers.includes("required_persona_abstained:portfolio_risk_allocator"));
  console.log("stock-pro-council-replay: required persona abstention block OK");
}

{
  const binding = veto();
  const cleared = veto({
    vetoId: "veto-data-pit-002",
    issuedAt: "2026-08-06T00:40:00+09:00",
    status: "cleared",
    supersedesVetoId: binding.vetoId,
    clearanceMode: "new_evidence",
    clearedAt: "2026-08-06T00:40:00+09:00",
    clearanceEvidenceRefs: ["source-contract:confirmed:replay"],
    ruleVersion: "data-pit-v1",
  });
  const verdicts = requiredPersonaIdsForCase("general").map((personaId) => verdict(personaId));
  const result = buildCouncilReplayResult(
    makePackage("general", verdicts, [], [binding, cleared]),
    schemas,
    catalog,
  );
  assert.equal(result.eligibleForRecommendationCandidate, true);
  assert.deepEqual(result.bindingVetoIds, []);
  console.log("stock-pro-council-replay: evidence-cleared veto head OK");
}

{
  const pkg = supportedPackage("technology");
  const tampered = {
    ...pkg,
    manifest: { ...pkg.manifest, verdictHashes: ["0".repeat(64)] },
  };
  assert.ok(validateCouncilReplayPackage(tampered, schemas, catalog)
    .some((item) => item.code === "invalid_replay_manifest_hash" || item.code === "verdict_hash_set_mismatch"));

  const lateVerdicts = pkg.verdicts.map((item, index) => index === 0
    ? { ...item, issuedAt: "2026-08-06T01:01:00+09:00" }
    : item);
  const latePackage = makePackage("technology", lateVerdicts, [], [], CREATED_AT);
  assert.ok(validateCouncilReplayPackage(latePackage, schemas, catalog)
    .some((item) => item.code === "replay_record_after_manifest"));
  console.log("stock-pro-council-replay: manifest hash/future record guards OK");
}

{
  const binding = veto();
  const verdicts = requiredPersonaIdsForCase("general").map((personaId) => verdict(personaId));
  const pkg = makePackage("general", verdicts, [], [binding]);
  assert.ok(validateCouncilReplayPackage(pkg, schemas, catalog)
    .some((item) => item.code === "binding_veto_without_veto_verdict"));
  console.log("stock-pro-council-replay: binding veto/verdict bidirectional guard OK");
}

console.log("stock-pro-council-replay: 全テスト成功");
