import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSON_SCHEMA, load } from "js-yaml";
import { validate, type JsonSchema } from "./schema.js";

export type CouncilIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export type CouncilPersona = {
  id: string;
  label: string;
  jurisdiction: string[];
  mission: string;
  requiredInputs: string[];
  abstainWhen: string[];
  hardVetoes: string[];
  calibration: string[];
};

export type StockProCouncilV2Catalog = {
  version: number;
  status: string;
  updatedAt: string;
  purpose: string;
  activationGate: {
    schemaValidated: boolean;
    verdictValidatorImplemented: boolean;
    dissentLedgerImplemented: boolean;
    deterministicReplayImplemented: boolean;
    calibrationStoreImplemented: boolean;
    recommendationIntegrationImplemented: boolean;
  };
  protocol: {
    voting: string;
    majorityCanOverrideHardVeto: boolean;
    abstentionIsFirstClass: boolean;
    preserveDissent: boolean;
    confidenceRequiresCalibration: boolean;
    separateStockVerdictAndSuitability: boolean;
    automaticTradingAuthorized: boolean;
  };
  personas: CouncilPersona[];
  existingAgentMigration: { status: string; policy: string[] };
  nextImplementation: string[];
};

export type PersonaVerdict = {
  schemaVersion: 1;
  personaId: string;
  personaVersion: string;
  runId: string;
  issuedAt: string;
  informationCutoff: string;
  jurisdiction: string;
  stance: "support" | "oppose" | "neutral" | "abstain" | "veto";
  decisionView?: "BUY" | "WATCH" | "WAIT" | "AVOID";
  confidence?: number;
  calibrationRef?: string;
  evidenceRefs: string[];
  facts: string[];
  assumptions: string[];
  forecasts: string[];
  risks: string[];
  missingEvidence: string[];
  vetoCodes: string[];
  falsificationConditions: string[];
  nextEvidenceActions: string[];
  modelVersion: string;
};

export const STOCK_PRO_COUNCIL_V2_PATHS = {
  catalog: "research/personas/stock-pro-council-v2.yml",
  catalogSchema: "research/schemas/stock-pro-council-v2.schema.json",
  verdictSchema: "research/schemas/persona-verdict.schema.json",
  verdictDir: "research/persona_verdicts",
} as const;

const REQUIRED_PERSONA_IDS = [
  "jp_event_driven_pm",
  "forensic_governance_analyst",
  "industry_supply_chain_analyst",
  "valuation_expectations_analyst",
  "market_execution_specialist",
  "quant_causal_validator",
  "short_red_team",
  "portfolio_risk_allocator",
  "data_pit_auditor",
  "personal_suitability_adviser",
  "cio_synthesizer",
] as const;

const REQUIRED_MIGRATION_POLICIES = [
  "existing_functional_agents_remain_discovery_lenses",
  "investor_named_agents_are_question_generators_not_authorities",
  "no_existing_agent_may_issue_buy_or_hard_veto_without_normalized_evidence",
  "map_legend_outputs_into_functional_jurisdictions",
] as const;

function sortIssues(issues: CouncilIssue[]): CouncilIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function schemaIssues(value: unknown, schema: JsonSchema, target: string): CouncilIssue[] {
  return validate(value, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path ? `${target}:${error.path}` : target,
    message: error.message,
  }));
}

function duplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function duplicateIssues(
  values: string[],
  code: string,
  target: string,
  label: string,
): CouncilIssue[] {
  return duplicates(values).map((value) => ({
    severity: "error",
    code,
    target,
    message: `${label}が重複しています: ${value}`,
  }));
}

function personaById(catalog: StockProCouncilV2Catalog): Map<string, CouncilPersona> {
  return new Map(catalog.personas.map((persona) => [persona.id, persona]));
}

export function validateStockProCouncilV2Catalog(
  value: unknown,
  schema: JsonSchema,
): CouncilIssue[] {
  const issues = schemaIssues(value, schema, STOCK_PRO_COUNCIL_V2_PATHS.catalog);
  if (issues.length > 0) return sortIssues(issues);

  const catalog = value as StockProCouncilV2Catalog;
  issues.push(
    ...duplicateIssues(
      catalog.personas.map((persona) => persona.id),
      "duplicate_persona_id",
      STOCK_PRO_COUNCIL_V2_PATHS.catalog,
      "persona id",
    ),
    ...duplicateIssues(
      catalog.personas.map((persona) => persona.label),
      "duplicate_persona_label",
      STOCK_PRO_COUNCIL_V2_PATHS.catalog,
      "persona label",
    ),
  );

  const ids = new Set(catalog.personas.map((persona) => persona.id));
  for (const id of REQUIRED_PERSONA_IDS) {
    if (!ids.has(id)) {
      issues.push({
        severity: "error",
        code: "missing_core_persona",
        target: STOCK_PRO_COUNCIL_V2_PATHS.catalog,
        message: `core personaがありません: ${id}`,
      });
    }
  }

  if (catalog.activationGate.schemaValidated !== true) {
    issues.push({
      severity: "error",
      code: "schema_gate_not_updated",
      target: "activationGate.schemaValidated",
      message: "catalog schema実装後はschemaValidated=trueが必要です",
    });
  }
  if (catalog.activationGate.verdictValidatorImplemented !== true) {
    issues.push({
      severity: "error",
      code: "verdict_validator_gate_not_updated",
      target: "activationGate.verdictValidatorImplemented",
      message: "PersonaVerdict validator実装後はverdictValidatorImplemented=trueが必要です",
    });
  }
  for (const [gate, value] of Object.entries(catalog.activationGate)) {
    if (
      gate !== "schemaValidated" &&
      gate !== "verdictValidatorImplemented" &&
      value === true
    ) {
      issues.push({
        severity: "error",
        code: "premature_council_gate",
        target: `activationGate.${gate}`,
        message: `${gate}は対応artifactとfixtureが完成するまでfalseです`,
      });
    }
  }

  const migrationPolicies = new Set(catalog.existingAgentMigration.policy);
  for (const policy of REQUIRED_MIGRATION_POLICIES) {
    if (!migrationPolicies.has(policy)) {
      issues.push({
        severity: "error",
        code: "missing_agent_migration_policy",
        target: "existingAgentMigration.policy",
        message: `既存agent移行policyがありません: ${policy}`,
      });
    }
  }

  const dataAuditor = catalog.personas.find((persona) => persona.id === "data_pit_auditor");
  if (dataAuditor && dataAuditor.abstainWhen.length > 0) {
    issues.push({
      severity: "error",
      code: "data_auditor_may_not_abstain",
      target: "personas(data_pit_auditor).abstainWhen",
      message: "Data/PIT Auditorは検証不能時もabstainせず、missing evidenceまたはvetoを返します",
    });
  }

  const cio = catalog.personas.find((persona) => persona.id === "cio_synthesizer");
  for (const required of ["all_persona_verdicts", "dissent_ledger"] as const) {
    if (cio && !cio.requiredInputs.includes(required)) {
      issues.push({
        severity: "error",
        code: "cio_missing_required_input",
        target: "personas(cio_synthesizer).requiredInputs",
        message: `CIO requiredInputsに${required}が必要です`,
      });
    }
  }

  for (const persona of catalog.personas) {
    const overlap = persona.hardVetoes.filter((code) => persona.abstainWhen.includes(code));
    if (overlap.length > 0) {
      issues.push({
        severity: "error",
        code: "veto_abstain_overlap",
        target: `personas(${persona.id})`,
        message: `同一条件をabstainとhard vetoへ重複定義できません: ${overlap.join(", ")}`,
      });
    }
  }

  return sortIssues(issues);
}

function categoryOverlap(verdict: PersonaVerdict): string[] {
  const categories: Array<[string, string[]]> = [
    ["facts", verdict.facts],
    ["assumptions", verdict.assumptions],
    ["forecasts", verdict.forecasts],
  ];
  const owners = new Map<string, string[]>();
  for (const [category, values] of categories) {
    for (const value of values) {
      const list = owners.get(value) ?? [];
      list.push(category);
      owners.set(value, list);
    }
  }
  return [...owners.entries()]
    .filter(([, categoriesForValue]) => categoriesForValue.length > 1)
    .map(([value, categoriesForValue]) => `${value} (${categoriesForValue.join("/")})`)
    .sort();
}

export function validatePersonaVerdict(
  value: unknown,
  schema: JsonSchema,
  catalog: StockProCouncilV2Catalog,
  target = "PersonaVerdict",
): CouncilIssue[] {
  const issues = schemaIssues(value, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  const verdict = value as PersonaVerdict;
  const persona = personaById(catalog).get(verdict.personaId);
  if (!persona) {
    issues.push({
      severity: "error",
      code: "unknown_persona",
      target: `${target}.personaId`,
      message: `catalogに存在しないpersonaです: ${verdict.personaId}`,
    });
    return sortIssues(issues);
  }

  if (verdict.personaVersion !== String(catalog.version)) {
    issues.push({
      severity: "error",
      code: "persona_version_mismatch",
      target: `${target}.personaVersion`,
      message: `personaVersion=${verdict.personaVersion}はcatalog version=${catalog.version}と一致しません`,
    });
  }
  if (!persona.jurisdiction.includes(verdict.jurisdiction)) {
    issues.push({
      severity: "error",
      code: "jurisdiction_violation",
      target: `${target}.jurisdiction`,
      message: `${verdict.personaId}のjurisdiction外です: ${verdict.jurisdiction}`,
    });
  }
  if (Date.parse(verdict.issuedAt) < Date.parse(verdict.informationCutoff)) {
    issues.push({
      severity: "error",
      code: "issued_before_information_cutoff",
      target: `${target}.issuedAt`,
      message: "issuedAtはinformationCutoff以後である必要があります",
    });
  }

  if (verdict.stance === "veto") {
    if (verdict.vetoCodes.length === 0) {
      issues.push({
        severity: "error",
        code: "veto_without_code",
        target: `${target}.vetoCodes`,
        message: "stance=vetoには最低1件のvetoCodeが必要です",
      });
    }
    const unknownCodes = verdict.vetoCodes.filter((code) => !persona.hardVetoes.includes(code));
    if (unknownCodes.length > 0) {
      issues.push({
        severity: "error",
        code: "veto_outside_jurisdiction",
        target: `${target}.vetoCodes`,
        message: `persona catalogにないvetoCodeです: ${unknownCodes.join(", ")}`,
      });
    }
  } else if (verdict.vetoCodes.length > 0) {
    issues.push({
      severity: "error",
      code: "veto_code_without_veto_stance",
      target: `${target}.vetoCodes`,
      message: "vetoCodeを出す場合はstance=vetoが必要です",
    });
  }

  if (verdict.stance === "abstain") {
    if (verdict.missingEvidence.length === 0 || verdict.nextEvidenceActions.length === 0) {
      issues.push({
        severity: "error",
        code: "abstain_without_missing_evidence",
        target,
        message: "abstainにはmissingEvidenceとnextEvidenceActionsが必要です",
      });
    }
    if (verdict.decisionView !== undefined || verdict.confidence !== undefined) {
      issues.push({
        severity: "error",
        code: "abstain_with_decision",
        target,
        message: "abstainはdecisionViewまたはconfidenceを出せません",
      });
    }
  }

  if (
    ["support", "oppose", "veto"].includes(verdict.stance) &&
    verdict.evidenceRefs.length === 0
  ) {
    issues.push({
      severity: "error",
      code: "stance_without_evidence",
      target: `${target}.evidenceRefs`,
      message: `${verdict.stance}にはnormalized evidence参照が必要です`,
    });
  }

  if (verdict.confidence !== undefined && !verdict.calibrationRef) {
    issues.push({
      severity: "error",
      code: "confidence_without_calibration",
      target: `${target}.confidence`,
      message: "confidenceを出すにはcalibrationRefが必要です",
    });
  }
  if (verdict.calibrationRef && verdict.confidence === undefined) {
    issues.push({
      severity: "warning",
      code: "unused_calibration_ref",
      target: `${target}.calibrationRef`,
      message: "confidenceなしのcalibrationRefは使用されません",
    });
  }

  const overlaps = categoryOverlap(verdict);
  if (overlaps.length > 0) {
    issues.push({
      severity: "error",
      code: "claim_category_overlap",
      target,
      message: `facts/assumptions/forecastsを重複保存できません: ${overlaps.join(", ")}`,
    });
  }

  if (verdict.facts.length > 0 && verdict.evidenceRefs.length === 0) {
    issues.push({
      severity: "error",
      code: "facts_without_evidence",
      target: `${target}.facts`,
      message: "factsにはevidenceRefsが必要です",
    });
  }

  if (
    verdict.decisionView === "BUY" &&
    ["oppose", "abstain", "veto"].includes(verdict.stance)
  ) {
    issues.push({
      severity: "error",
      code: "buy_conflicts_with_stance",
      target: `${target}.decisionView`,
      message: `stance=${verdict.stance}でBUYを出せません`,
    });
  }

  return sortIssues(issues);
}

export function loadCouncilYaml(path: string): unknown {
  return load(readFileSync(path, "utf-8"), { schema: JSON_SCHEMA });
}

export function loadCouncilSchema(path: string): JsonSchema {
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function readVerdictJsonl(path: string): Array<{ value?: unknown; issue?: CouncilIssue }> {
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { value: JSON.parse(line) as unknown };
      } catch (error) {
        return {
          issue: {
            severity: "error" as const,
            code: "invalid_verdict_json",
            target: `${path}:${index + 1}`,
            message: (error as Error).message,
          },
        };
      }
    });
}

export function validateRepositoryStockProCouncilV2(): {
  catalog: StockProCouncilV2Catalog | null;
  catalogIssues: CouncilIssue[];
  verdictIssues: CouncilIssue[];
  personaCount: number;
  verdictCount: number;
} {
  const catalogValue = loadCouncilYaml(STOCK_PRO_COUNCIL_V2_PATHS.catalog);
  const catalogSchema = loadCouncilSchema(STOCK_PRO_COUNCIL_V2_PATHS.catalogSchema);
  const verdictSchema = loadCouncilSchema(STOCK_PRO_COUNCIL_V2_PATHS.verdictSchema);
  const catalogIssues = validateStockProCouncilV2Catalog(catalogValue, catalogSchema);
  const catalog = catalogIssues.some((issue) => issue.severity === "error")
    ? null
    : catalogValue as StockProCouncilV2Catalog;

  const verdictIssues: CouncilIssue[] = [];
  const verdicts: PersonaVerdict[] = [];
  if (catalog && existsSync(STOCK_PRO_COUNCIL_V2_PATHS.verdictDir)) {
    for (const filename of readdirSync(STOCK_PRO_COUNCIL_V2_PATHS.verdictDir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()) {
      const path = join(STOCK_PRO_COUNCIL_V2_PATHS.verdictDir, filename);
      for (const [index, parsed] of readVerdictJsonl(path).entries()) {
        if (parsed.issue) {
          verdictIssues.push(parsed.issue);
          continue;
        }
        const target = `${path}:${index + 1}`;
        const issues = validatePersonaVerdict(parsed.value, verdictSchema, catalog, target);
        verdictIssues.push(...issues);
        if (!issues.some((issue) => issue.severity === "error")) {
          verdicts.push(parsed.value as PersonaVerdict);
        }
      }
    }
  }

  verdictIssues.push(...duplicateIssues(
    verdicts.map((verdict) => `${verdict.runId}:${verdict.personaId}`),
    "duplicate_persona_verdict",
    STOCK_PRO_COUNCIL_V2_PATHS.verdictDir,
    "run/persona verdict",
  ));

  const byRun = new Map<string, PersonaVerdict[]>();
  for (const verdict of verdicts) {
    const group = byRun.get(verdict.runId) ?? [];
    group.push(verdict);
    byRun.set(verdict.runId, group);
  }
  for (const [runId, group] of byRun) {
    const cutoffs = new Set(group.map((verdict) => verdict.informationCutoff));
    if (cutoffs.size > 1) {
      verdictIssues.push({
        severity: "error",
        code: "run_information_cutoff_mismatch",
        target: runId,
        message: "同一Council runのPersonaVerdictはinformationCutoffを共有する必要があります",
      });
    }
  }

  return {
    catalog,
    catalogIssues: sortIssues(catalogIssues),
    verdictIssues: sortIssues(verdictIssues),
    personaCount: catalog?.personas.length ?? 0,
    verdictCount: verdicts.length,
  };
}
