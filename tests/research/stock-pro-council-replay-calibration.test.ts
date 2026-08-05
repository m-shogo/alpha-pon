import assert from "node:assert/strict";
import {
  buildCalibrationAwareCouncilReplayResult,
  validateCalibrationAwareCouncilReplayPackage,
  type CalibrationAwareCouncilReplayPackage,
} from "../../src/research/stock-pro-council-replay-calibration.js";
import {
  hashPersonaVerdict,
  requiredPersonaIdsForCase,
  withReplayManifestHash,
  type CouncilReplaySchemas,
} from "../../src/research/stock-pro-council-replay.js";
import {
  withPersonaCalibrationHash,
  type PersonaCalibrationRecord,
} from "../../src/research/stock-pro-council-calibration.js";
import {
  withDissentHash,
  withVetoHash,
  type CouncilDissentRecord,
  type CouncilVetoRecord,
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
const replaySchemas: CouncilReplaySchemas = {
  manifest: loadCouncilSchema("research/schemas/council-replay-manifest.schema.json"),
  result: loadCouncilSchema("research/schemas/council-replay-result.schema.json"),
  verdict: loadCouncilSchema("research/schemas/persona-verdict.schema.json"),
  dissent: loadCouncilSchema("research/schemas/council-dissent-record.schema.json"),
  veto: loadCouncilSchema("research/schemas/council-veto-record.schema.json"),
};
const calibrationSchema = loadCouncilSchema(
  "research/schemas/persona-calibration-record.schema.json",
);
const RUN_ID = "council-run-calibrated-replay";
const CUTOFF = "2026-08-06T00:25:00+09:00";

const JURISDICTION: Record<string, string> = {
  jp_event_driven_pm: "event_state_transition",
  market_execution_specialist: "executable_price",
  quant_causal_validator: "pit_and_sample_integrity",
  short_red_team: "falsification",
  data_pit_auditor: "provenance",
  cio_synthesizer: "final_record_assembly",
};

function verdict(personaId: string, overrides: Partial<PersonaVerdict> = {}): PersonaVerdict {
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
    evidenceRefs: [`evidence:${personaId}:calibrated-replay`],
    facts: [`fact:${personaId}:calibrated-replay`],
    assumptions: [`assumption:${personaId}:calibrated-replay`],
    forecasts: [`forecast:${personaId}:calibrated-replay`],
    risks: [`risk:${personaId}:calibrated-replay`],
    missingEvidence: [],
    vetoCodes: [],
    falsificationConditions: [`falsification:${personaId}:calibrated-replay`],
    nextEvidenceActions: [`next:${personaId}:calibrated-replay`],
    modelVersion: "fixture-model-v1",
    ...overrides,
  };
}

function calibration(overrides: Partial<PersonaCalibrationRecord> = {}): PersonaCalibrationRecord {
  const { contentHash: _contentHash, ...inputOverrides } = overrides;
  return withPersonaCalibrationHash({
    schemaVersion: 1,
    calibrationId: "calibration-event-replay-001",
    personaId: "jp_event_driven_pm",
    personaVersion: "2",
    jurisdiction: "event_state_transition",
    metric: "event_classification_accuracy",
    segment: { sector: "all", regime: "mixed", horizon: "D+1" },
    periodFrom: "2024-01-01",
    periodTo: "2026-07-31",
    outcomeCutoff: "2026-08-01T00:00:00+09:00",
    evaluatedAt: "2026-08-02T00:00:00+09:00",
    sampleSize: 30,
    minimumSampleSize: 30,
    normalizedScore: 0.7,
    confidenceInterval: { low: 0.55, high: 0.82 },
    status: "eligible",
    eligibleForConfidence: true,
    confidenceCap: 0.75,
    previousWeightMultiplier: 1,
    recommendedWeightMultiplier: 1.05,
    maxWeightStep: 0.05,
    humanApprovalRequired: true,
    automaticWeightApplicationAuthorized: false,
    evidenceRefs: ["calibration-evidence:event:replay"],
    modelVersion: "fixture-model-v1",
    ruleVersion: "calibration-rule-v1",
    ...inputOverrides,
  });
}

function makePackage(
  verdicts: PersonaVerdict[],
  calibrations: PersonaCalibrationRecord[],
  dissent: CouncilDissentRecord[] = [],
  veto: CouncilVetoRecord[] = [],
  calibrationHashes = calibrations.map((record) => record.contentHash),
): CalibrationAwareCouncilReplayPackage {
  const manifest = withReplayManifestHash({
    schemaVersion: 1,
    replayId: "replay-event-calibrated-001",
    councilRunId: RUN_ID,
    caseType: "event_driven",
    informationCutoff: CUTOFF,
    createdAt: "2026-08-06T01:00:00+09:00",
    evidencePackageHash: "a".repeat(64),
    priceSnapshotHash: "b".repeat(64),
    codeVersion: "fixture-code-v1",
    ruleVersion: "council-firewall-v1",
    personaCatalogVersion: "2",
    requiredPersonaIds: requiredPersonaIdsForCase("event_driven"),
    verdictHashes: verdicts.map(hashPersonaVerdict),
    dissentHashes: dissent.map((record) => record.contentHash),
    vetoHashes: veto.map((record) => record.contentHash),
    calibrationHashes,
    automaticTradingAuthorized: false,
  });
  return { manifest, verdicts, dissent, veto, calibrations };
}

function supportedVerdicts(confidence = 0.7): PersonaVerdict[] {
  return requiredPersonaIdsForCase("event_driven").map((personaId) =>
    personaId === "jp_event_driven_pm"
      ? verdict(personaId, {
        confidence,
        calibrationRef: "calibration-event-replay-001",
      })
      : verdict(personaId));
}

{
  const calibrated = calibration();
  const pkg = makePackage(supportedVerdicts(), [calibrated]);
  const result = buildCalibrationAwareCouncilReplayResult(
    pkg,
    replaySchemas,
    calibrationSchema,
    catalog,
  );
  assert.equal(result.eligibleForRecommendationCandidate, true);
  assert.deepEqual(result.blockers, []);
  console.log("stock-pro-council-replay-calibration: eligible confidence replay OK");
}

{
  const calibrated = calibration();
  const pkg = makePackage(supportedVerdicts(), [calibrated], [], [], []);
  assert.ok(validateCalibrationAwareCouncilReplayPackage(
    pkg,
    replaySchemas,
    calibrationSchema,
    catalog,
  ).some((issue) => issue.code === "calibration_hash_set_mismatch"));
  console.log("stock-pro-council-replay-calibration: unpinned calibration block OK");
}

{
  const calibrated = calibration();
  const pkg = makePackage(supportedVerdicts(0.9), [calibrated]);
  assert.ok(validateCalibrationAwareCouncilReplayPackage(
    pkg,
    replaySchemas,
    calibrationSchema,
    catalog,
  ).some((issue) => issue.code === "confidence_exceeds_calibrated_cap"));
  console.log("stock-pro-council-replay-calibration: confidence cap block OK");
}

{
  const calibrated = calibration();
  const verdicts = supportedVerdicts().map((record) =>
    record.personaId === "data_pit_auditor"
      ? verdict("data_pit_auditor", {
        stance: "veto",
        decisionView: "AVOID",
        vetoCodes: ["unknown_license"],
      })
      : record);
  const dissent = withDissentHash({
    schemaVersion: 1,
    dissentId: "dissent-data-pit-calibrated-replay",
    dissentCode: "unknown_license",
    councilRunId: RUN_ID,
    personaId: "data_pit_auditor",
    personaVersion: "2",
    issuedAt: "2026-08-06T00:31:00+09:00",
    informationCutoff: CUTOFF,
    jurisdiction: "provenance",
    stance: "veto",
    summary: "licenseが不明なためRecommendation候補へ進めない",
    evidenceRefs: ["source-contract:unknown:calibrated-replay"],
    unresolvedQuestions: ["保存権と利用権が確認できるか"],
    status: "open",
  });
  const veto = withVetoHash({
    schemaVersion: 1,
    vetoId: "veto-data-pit-calibrated-replay",
    councilRunId: RUN_ID,
    personaId: "data_pit_auditor",
    personaVersion: "2",
    jurisdiction: "provenance",
    vetoCode: "unknown_license",
    scope: "data",
    issuedAt: "2026-08-06T00:32:00+09:00",
    informationCutoff: CUTOFF,
    evidenceRefs: ["source-contract:unknown:calibrated-replay"],
    clearanceRequirements: ["保存権と利用権を一次契約で確認する"],
    status: "binding",
    ruleVersion: "data-pit-v1",
  });
  const result = buildCalibrationAwareCouncilReplayResult(
    makePackage(verdicts, [calibrated], [dissent], [veto]),
    replaySchemas,
    calibrationSchema,
    catalog,
  );
  assert.equal(result.eligibleForRecommendationCandidate, false);
  assert.ok(result.blockers.includes(`binding_veto:${veto.vetoId}`));
  assert.ok(result.blockers.includes("required_persona_veto:data_pit_auditor"));
  console.log("stock-pro-council-replay-calibration: calibration cannot override PIT veto OK");
}

console.log("stock-pro-council-replay-calibration: 全テスト成功");
