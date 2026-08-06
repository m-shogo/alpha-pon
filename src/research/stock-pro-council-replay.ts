import { createHash } from "node:crypto";
import {
  validateCouncilLedgerLifecycle,
} from "./stock-pro-council-ledger-hardening.js";
import {
  validateDissentLedger,
  validateVetoLedger,
  type CouncilDissentRecord,
  type CouncilVetoRecord,
} from "./stock-pro-council-ledgers.js";
import {
  validatePersonaVerdict,
  type CouncilIssue,
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "./stock-pro-council-v2-validation.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type CouncilCaseType =
  | "event_driven"
  | "misconduct_accounting"
  | "technology"
  | "short_research"
  | "position_sizing"
  | "general";

export type CouncilReplayManifest = {
  schemaVersion: 1;
  replayId: string;
  councilRunId: string;
  caseType: CouncilCaseType;
  informationCutoff: string;
  createdAt: string;
  evidencePackageHash: string;
  priceSnapshotHash: string;
  codeVersion: string;
  ruleVersion: string;
  personaCatalogVersion: string;
  requiredPersonaIds: string[];
  verdictHashes: string[];
  dissentHashes: string[];
  vetoHashes: string[];
  calibrationHashes: string[];
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type CouncilReplayManifestInput = Omit<CouncilReplayManifest, "contentHash">;

export type CouncilReplayResult = {
  schemaVersion: 1;
  replayId: string;
  councilRunId: string;
  caseType: CouncilCaseType;
  informationCutoff: string;
  eligibleForRecommendationCandidate: boolean;
  blockers: string[];
  requiredPersonaIds: string[];
  presentPersonaIds: string[];
  missingPersonaIds: string[];
  abstainingPersonaIds: string[];
  vetoingPersonaIds: string[];
  bindingVetoIds: string[];
  dissentIds: string[];
  manifestHash: string;
  resultHash: string;
  automaticTradingAuthorized: false;
};

export type CouncilReplayResultInput = Omit<CouncilReplayResult, "resultHash">;

export type CouncilReplayPackage = {
  manifest: CouncilReplayManifest;
  verdicts: PersonaVerdict[];
  dissent: CouncilDissentRecord[];
  veto: CouncilVetoRecord[];
};

export type CouncilReplaySchemas = {
  manifest: JsonSchema;
  result: JsonSchema;
  verdict: JsonSchema;
  dissent: JsonSchema;
  veto: JsonSchema;
};

const REQUIRED_PERSONA_MATRIX: Record<CouncilCaseType, readonly string[]> = {
  event_driven: [
    "jp_event_driven_pm",
    "market_execution_specialist",
    "quant_causal_validator",
    "short_red_team",
    "data_pit_auditor",
    "cio_synthesizer",
  ],
  misconduct_accounting: [
    "jp_event_driven_pm",
    "forensic_governance_analyst",
    "market_execution_specialist",
    "quant_causal_validator",
    "short_red_team",
    "data_pit_auditor",
    "cio_synthesizer",
  ],
  technology: [
    "industry_supply_chain_analyst",
    "valuation_expectations_analyst",
    "short_red_team",
    "data_pit_auditor",
    "cio_synthesizer",
  ],
  short_research: [
    "forensic_governance_analyst",
    "market_execution_specialist",
    "quant_causal_validator",
    "short_red_team",
    "portfolio_risk_allocator",
    "data_pit_auditor",
    "cio_synthesizer",
  ],
  position_sizing: [
    "portfolio_risk_allocator",
    "data_pit_auditor",
    "personal_suitability_adviser",
    "cio_synthesizer",
  ],
  general: [
    "valuation_expectations_analyst",
    "short_red_team",
    "portfolio_risk_allocator",
    "data_pit_auditor",
    "cio_synthesizer",
  ],
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function withoutManifestHash(manifest: CouncilReplayManifest): CouncilReplayManifestInput {
  const { contentHash: _contentHash, ...input } = manifest;
  return input;
}

function withoutResultHash(result: CouncilReplayResult): CouncilReplayResultInput {
  const { resultHash: _resultHash, ...input } = result;
  return input;
}

export function hashPersonaVerdict(verdict: PersonaVerdict): string {
  return hashValue(verdict);
}

export function computeReplayManifestHash(
  manifest: CouncilReplayManifest | CouncilReplayManifestInput,
): string {
  return hashValue("contentHash" in manifest ? withoutManifestHash(manifest) : manifest);
}

export function withReplayManifestHash(
  manifest: CouncilReplayManifestInput,
): CouncilReplayManifest {
  const normalized: CouncilReplayManifestInput = {
    ...manifest,
    requiredPersonaIds: sortedUnique(manifest.requiredPersonaIds),
    verdictHashes: sortedUnique(manifest.verdictHashes),
    dissentHashes: sortedUnique(manifest.dissentHashes),
    vetoHashes: sortedUnique(manifest.vetoHashes),
    calibrationHashes: sortedUnique(manifest.calibrationHashes),
  };
  return { ...normalized, contentHash: computeReplayManifestHash(normalized) };
}

export function computeReplayResultHash(
  result: CouncilReplayResult | CouncilReplayResultInput,
): string {
  return hashValue("resultHash" in result ? withoutResultHash(result) : result);
}

export function requiredPersonaIdsForCase(caseType: CouncilCaseType): string[] {
  return [...REQUIRED_PERSONA_MATRIX[caseType]].sort();
}

function issue(code: string, target: string, message: string): CouncilIssue {
  return { severity: "error", code, target, message };
}

function schemaIssues(value: unknown, schema: JsonSchema, target: string): CouncilIssue[] {
  return validate(value, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path ? `${target}:${error.path}` : target,
    message: error.message,
  }));
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function activeDissentHeads(records: CouncilDissentRecord[]): CouncilDissentRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesDissentId ? [record.supersedesDissentId] : []),
  );
  return records.filter((record) => !superseded.has(record.dissentId));
}

function activeVetoHeads(records: CouncilVetoRecord[]): CouncilVetoRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesVetoId ? [record.supersedesVetoId] : []),
  );
  return records.filter((record) => !superseded.has(record.vetoId));
}

function packageIdentityIssues(pkg: CouncilReplayPackage): CouncilIssue[] {
  const { manifest } = pkg;
  const issues: CouncilIssue[] = [];
  const createdAtMs = Date.parse(manifest.createdAt);
  const check = (
    values: Array<{ runId: string; cutoff: string; issuedAt: string; target: string }>,
  ): void => {
    for (const value of values) {
      if (value.runId !== manifest.councilRunId) {
        issues.push(issue(
          "replay_run_id_mismatch",
          value.target,
          `${value.runId} != ${manifest.councilRunId}`,
        ));
      }
      if (value.cutoff !== manifest.informationCutoff) {
        issues.push(issue(
          "replay_information_cutoff_mismatch",
          value.target,
          `${value.cutoff} != ${manifest.informationCutoff}`,
        ));
      }
      if (Date.parse(value.issuedAt) > createdAtMs) {
        issues.push(issue(
          "replay_record_after_manifest",
          value.target,
          `${value.issuedAt} is after manifest.createdAt=${manifest.createdAt}`,
        ));
      }
    }
  };

  check(pkg.verdicts.map((record) => ({
    runId: record.runId,
    cutoff: record.informationCutoff,
    issuedAt: record.issuedAt,
    target: `verdict:${record.personaId}`,
  })));
  check(pkg.dissent.map((record) => ({
    runId: record.councilRunId,
    cutoff: record.informationCutoff,
    issuedAt: record.issuedAt,
    target: `dissent:${record.dissentId}`,
  })));
  check(pkg.veto.map((record) => ({
    runId: record.councilRunId,
    cutoff: record.informationCutoff,
    issuedAt: record.issuedAt,
    target: `veto:${record.vetoId}`,
  })));
  return issues;
}

function referenceCompletenessIssues(pkg: CouncilReplayPackage): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const dissentHeads = activeDissentHeads(pkg.dissent);
  const vetoByPersonaCode = new Set(
    pkg.veto.map((record) => `${record.personaId}:${record.vetoCode}`),
  );
  const verdictByPersona = new Map(pkg.verdicts.map((record) => [record.personaId, record]));

  for (const verdict of pkg.verdicts) {
    if (verdict.stance !== "support") {
      const hasDissent = dissentHeads.some((record) => record.personaId === verdict.personaId);
      if (!hasDissent) {
        issues.push(issue(
          "missing_dissent_for_non_support",
          verdict.personaId,
          `stance=${verdict.stance}のPersonaVerdictには保存済みdissent headが必要です`,
        ));
      }
    }
    for (const vetoCode of verdict.vetoCodes) {
      if (!vetoByPersonaCode.has(`${verdict.personaId}:${vetoCode}`)) {
        issues.push(issue(
          "missing_veto_ledger_record",
          verdict.personaId,
          `vetoCode=${vetoCode}に対応するveto ledger recordがありません`,
        ));
      }
    }
  }

  for (const veto of activeVetoHeads(pkg.veto).filter((record) => record.status === "binding")) {
    const verdict = verdictByPersona.get(veto.personaId);
    if (!verdict || verdict.stance !== "veto" || !verdict.vetoCodes.includes(veto.vetoCode)) {
      issues.push(issue(
        "binding_veto_without_veto_verdict",
        veto.vetoId,
        "binding veto headには同一persona/codeのveto PersonaVerdictが必要です",
      ));
    }
  }
  return issues;
}

export function validateCouncilReplayPackage(
  pkg: CouncilReplayPackage,
  schemas: CouncilReplaySchemas,
  catalog: StockProCouncilV2Catalog,
): CouncilIssue[] {
  const issues: CouncilIssue[] = [
    ...schemaIssues(pkg.manifest, schemas.manifest, "CouncilReplayManifest"),
  ];
  if (issues.length > 0) return issues;

  const { manifest } = pkg;
  if (manifest.contentHash !== computeReplayManifestHash(manifest)) {
    issues.push(issue(
      "invalid_replay_manifest_hash",
      manifest.replayId,
      "CouncilReplayManifest contentHashが一致しません",
    ));
  }
  if (Date.parse(manifest.createdAt) < Date.parse(manifest.informationCutoff)) {
    issues.push(issue(
      "replay_created_before_cutoff",
      manifest.replayId,
      "createdAtはinformationCutoff以後である必要があります",
    ));
  }
  if (manifest.personaCatalogVersion !== String(catalog.version)) {
    issues.push(issue(
      "replay_persona_catalog_version_mismatch",
      manifest.replayId,
      `${manifest.personaCatalogVersion} != ${catalog.version}`,
    ));
  }

  const expectedRequired = requiredPersonaIdsForCase(manifest.caseType);
  if (!equalSets(manifest.requiredPersonaIds, expectedRequired)) {
    issues.push(issue(
      "required_persona_matrix_mismatch",
      manifest.replayId,
      `requiredPersonaIds must equal case matrix: ${expectedRequired.join(", ")}`,
    ));
  }

  const actualVerdictHashes = pkg.verdicts.map(hashPersonaVerdict);
  const actualDissentHashes = pkg.dissent.map((record) => record.contentHash);
  const actualVetoHashes = pkg.veto.map((record) => record.contentHash);
  if (!equalSets(manifest.verdictHashes, actualVerdictHashes)) {
    issues.push(issue("verdict_hash_set_mismatch", manifest.replayId, "verdict hash集合がmanifestと一致しません"));
  }
  if (!equalSets(manifest.dissentHashes, actualDissentHashes)) {
    issues.push(issue("dissent_hash_set_mismatch", manifest.replayId, "dissent hash集合がmanifestと一致しません"));
  }
  if (!equalSets(manifest.vetoHashes, actualVetoHashes)) {
    issues.push(issue("veto_hash_set_mismatch", manifest.replayId, "veto hash集合がmanifestと一致しません"));
  }

  for (const [index, verdict] of pkg.verdicts.entries()) {
    issues.push(...validatePersonaVerdict(
      verdict,
      schemas.verdict,
      catalog,
      `verdict[${index}](${verdict.personaId})`,
    ));
  }
  const verdictKeys = pkg.verdicts.map((record) => `${record.runId}:${record.personaId}`);
  if (new Set(verdictKeys).size !== verdictKeys.length) {
    issues.push(issue("duplicate_replay_persona_verdict", manifest.replayId, "同一run/persona verdictが重複しています"));
  }

  issues.push(
    ...validateDissentLedger(pkg.dissent, schemas.dissent, catalog),
    ...validateVetoLedger(pkg.veto, schemas.veto, catalog),
    ...validateCouncilLedgerLifecycle(pkg.dissent, pkg.veto),
    ...packageIdentityIssues(pkg),
    ...referenceCompletenessIssues(pkg),
  );

  return issues.sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

export function buildCouncilReplayResult(
  pkg: CouncilReplayPackage,
  schemas: CouncilReplaySchemas,
  catalog: StockProCouncilV2Catalog,
): CouncilReplayResult {
  const validationIssues = validateCouncilReplayPackage(pkg, schemas, catalog)
    .filter((item) => item.severity === "error");
  if (validationIssues.length > 0) {
    throw new Error(
      validationIssues.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"),
    );
  }

  const requiredPersonaIds = requiredPersonaIdsForCase(pkg.manifest.caseType);
  const presentPersonaIds = sortedUnique(pkg.verdicts.map((record) => record.personaId));
  const missingPersonaIds = requiredPersonaIds.filter((id) => !presentPersonaIds.includes(id));
  const abstainingPersonaIds = sortedUnique(
    pkg.verdicts
      .filter((record) => requiredPersonaIds.includes(record.personaId) && record.stance === "abstain")
      .map((record) => record.personaId),
  );
  const vetoingPersonaIds = sortedUnique(
    pkg.verdicts
      .filter((record) => requiredPersonaIds.includes(record.personaId) && record.stance === "veto")
      .map((record) => record.personaId),
  );
  const bindingVetoIds = activeVetoHeads(pkg.veto)
    .filter((record) => record.status === "binding")
    .map((record) => record.vetoId)
    .sort();
  const dissentIds = activeDissentHeads(pkg.dissent)
    .map((record) => record.dissentId)
    .sort();

  const blockers = sortedUnique([
    ...missingPersonaIds.map((id) => `missing_required_persona:${id}`),
    ...abstainingPersonaIds.map((id) => `required_persona_abstained:${id}`),
    ...vetoingPersonaIds.map((id) => `required_persona_veto:${id}`),
    ...bindingVetoIds.map((id) => `binding_veto:${id}`),
  ]);

  const input: CouncilReplayResultInput = {
    schemaVersion: 1,
    replayId: pkg.manifest.replayId,
    councilRunId: pkg.manifest.councilRunId,
    caseType: pkg.manifest.caseType,
    informationCutoff: pkg.manifest.informationCutoff,
    eligibleForRecommendationCandidate: blockers.length === 0,
    blockers,
    requiredPersonaIds,
    presentPersonaIds,
    missingPersonaIds,
    abstainingPersonaIds,
    vetoingPersonaIds,
    bindingVetoIds,
    dissentIds,
    manifestHash: pkg.manifest.contentHash,
    automaticTradingAuthorized: false,
  };
  const result: CouncilReplayResult = {
    ...input,
    resultHash: computeReplayResultHash(input),
  };
  const resultErrors = schemaIssues(result, schemas.result, "CouncilReplayResult");
  if (resultErrors.length > 0) {
    throw new Error(resultErrors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }
  return result;
}
