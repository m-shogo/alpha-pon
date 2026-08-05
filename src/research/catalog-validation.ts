import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { formatErrors, stableStringify, validate, type JsonSchema } from "./schema.js";

export type CatalogIssueSeverity = "error" | "warning";

export type CatalogIssue = {
  severity: CatalogIssueSeverity;
  code: string;
  target: string;
  message: string;
};

export type DataSourceRecord = {
  id: string;
  name: string;
  officialUrl: string;
  sourceClass: string;
  roles: string[];
  adoption: string;
  roadmapPhase: string;
  auth: { mode: string; secretRequired: boolean };
  rights: {
    rawStorage: string;
    gitCommit: string;
    publicDisplay: string;
    redistribution: string;
  };
  integration: {
    failureIsolation: string;
    existingState: string;
  };
  edgeUseCases: string[];
  blockers: string[];
  nextAction: string;
  discoveryPolicy?: {
    mayDiscoverFromSocial?: boolean;
    mayUseAsEvidence?: boolean;
    officialAccountRule?: string;
  };
};

export type DataSourceCatalog = {
  schemaVersion: number;
  updatedAt: string;
  policyVersion: string;
  sources: DataSourceRecord[];
};

export type EdgeFamilyRecord = {
  id: string;
  title: string;
  activationState: string;
  priority: string;
  mechanismSteps: string[];
  leadingEvidence: string[];
  confirmationEvidence: string[];
  confounders: string[];
  falsificationRules: string[];
  examples: string[];
  excludedShortcuts: string[];
  activationGate?: Record<string, boolean>;
};

export type EdgeFamilyCatalog = {
  schemaVersion: number;
  updatedAt: string;
  families: EdgeFamilyRecord[];
};

export const CATALOG_PATHS = {
  dataSources: "research/data_sources/catalog.yml",
  dataSourceSchema: "research/schemas/data-source.schema.json",
  edgeFamilies: "research/edge_catalog/technology-supply-chain-families.yml",
  edgeFamilySchema: "research/schemas/edge-family.schema.json",
  activeEdgesDir: "research/edge_registry/edges",
} as const;

function schemaIssues(
  value: unknown,
  schema: JsonSchema,
  target: string,
): CatalogIssue[] {
  return validate(value, schema).map((error) => ({
    severity: "error" as const,
    code: "schema_violation",
    target: error.path ? `${target}:${error.path}` : target,
    message: error.message,
  }));
}

function duplicateValues(values: string[]): string[] {
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
): CatalogIssue[] {
  return duplicateValues(values).map((value) => ({
    severity: "error",
    code,
    target,
    message: `${label}が重複しています: ${value}`,
  }));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function semanticDataSourceIssues(source: DataSourceRecord, index: number): CatalogIssue[] {
  const target = `sources[${index}](${source.id || "unknown"})`;
  const issues: CatalogIssue[] = [];
  const governed = source.adoption === "core_now" || source.adoption === "pilot_after_current_edge";

  if (!isHttpUrl(source.officialUrl)) {
    issues.push({
      severity: "error",
      code: "invalid_official_url",
      target: `${target}.officialUrl`,
      message: "officialUrlはHTTP(S)の有効なURLである必要があります",
    });
  }

  if (governed && source.blockers.length === 0) {
    issues.push({
      severity: "error",
      code: "missing_adoption_blocker",
      target: `${target}.blockers`,
      message: "core/pilot sourceには未解決blockerを最低1件明示してください",
    });
  }

  if (governed && source.nextAction.trim().length < 5) {
    issues.push({
      severity: "error",
      code: "missing_next_action",
      target: `${target}.nextAction`,
      message: "core/pilot sourceには具体的なnextActionが必要です",
    });
  }

  if (governed && source.edgeUseCases.length === 0) {
    issues.push({
      severity: "error",
      code: "missing_edge_use_case",
      target: `${target}.edgeUseCases`,
      message: "採用候補はどのEdgeに必要かを最低1件示してください",
    });
  }

  if (governed && Object.values(source.rights).some((value) => value === "unknown")) {
    issues.push({
      severity: "error",
      code: "unknown_rights_for_adopted_source",
      target: `${target}.rights`,
      message: "core/pilot sourceは保存・Git・公開・再配布権利をunknownのまま採用できません",
    });
  }

  if (governed && source.integration.failureIsolation === "not_applicable") {
    issues.push({
      severity: "error",
      code: "missing_failure_isolation",
      target: `${target}.integration.failureIsolation`,
      message: "外部source障害をLINE/daily pipelineから隔離する契約が必要です",
    });
  }

  if (source.auth.mode === "none" && source.auth.secretRequired) {
    issues.push({
      severity: "error",
      code: "auth_secret_mismatch",
      target: `${target}.auth`,
      message: "auth.mode=noneではsecretRequired=falseである必要があります",
    });
  }

  if (["api_key", "oauth", "application_id"].includes(source.auth.mode) && !source.auth.secretRequired) {
    issues.push({
      severity: "error",
      code: "auth_secret_mismatch",
      target: `${target}.auth`,
      message: `${source.auth.mode}はsecretRequired=trueである必要があります`,
    });
  }

  if (source.sourceClass === "discovery_only") {
    const policy = source.discoveryPolicy;
    if (!policy) {
      issues.push({
        severity: "error",
        code: "missing_discovery_policy",
        target: `${target}.discoveryPolicy`,
        message: "discovery_only sourceには用途制限を明記してください",
      });
    }
    if (source.roles.some((role) => role !== "discovery")) {
      issues.push({
        severity: "error",
        code: "discovery_source_role_leak",
        target: `${target}.roles`,
        message: "discovery_only sourceはdiscovery以外のroleを持てません",
      });
    }
    if (policy?.mayUseAsEvidence !== false) {
      issues.push({
        severity: "error",
        code: "discovery_source_as_evidence",
        target: `${target}.discoveryPolicy.mayUseAsEvidence`,
        message: "SNS・技術コミュニティ等のdiscovery sourceは証拠利用不可です",
      });
    }
    if (
      policy?.mayDiscoverFromSocial === true &&
      (policy.officialAccountRule ?? "").trim().length < 10
    ) {
      issues.push({
        severity: "error",
        code: "missing_official_account_rule",
        target: `${target}.discoveryPolicy.officialAccountRule`,
        message: "SNS発見を許可する場合は公式Webサイトからの逆向きリンク確認規則が必要です",
      });
    }
  }

  return issues;
}

export function validateDataSourceCatalog(
  value: unknown,
  schema: JsonSchema,
): CatalogIssue[] {
  const issues = schemaIssues(value, schema, CATALOG_PATHS.dataSources);
  if (issues.length > 0) return issues;

  const catalog = value as DataSourceCatalog;
  issues.push(
    ...duplicateIssues(
      catalog.sources.map((source) => source.id),
      "duplicate_source_id",
      CATALOG_PATHS.dataSources,
      "source id",
    ),
  );
  catalog.sources.forEach((source, index) => {
    issues.push(...semanticDataSourceIssues(source, index));
  });
  return sortIssues(issues);
}

function duplicatedArrayIssues(
  family: EdgeFamilyRecord,
  index: number,
): CatalogIssue[] {
  const target = `families[${index}](${family.id})`;
  const fields: Array<[keyof EdgeFamilyRecord, string[]]> = [
    ["mechanismSteps", family.mechanismSteps],
    ["leadingEvidence", family.leadingEvidence],
    ["confirmationEvidence", family.confirmationEvidence],
    ["confounders", family.confounders],
    ["falsificationRules", family.falsificationRules],
    ["examples", family.examples],
    ["excludedShortcuts", family.excludedShortcuts],
  ];
  return fields.flatMap(([field, values]) =>
    duplicateIssues(
      values,
      "duplicate_family_item",
      `${target}.${String(field)}`,
      String(field),
    ),
  );
}

function semanticEdgeFamilyIssues(
  family: EdgeFamilyRecord,
  index: number,
  activeEdgeIds: ReadonlySet<string>,
): CatalogIssue[] {
  const target = `families[${index}](${family.id || "unknown"})`;
  const issues: CatalogIssue[] = [];

  if (family.activationState !== "catalog") {
    issues.push({
      severity: "error",
      code: "catalog_activation_forbidden",
      target: `${target}.activationState`,
      message: "このcandidate catalogからactive-research以上へ直接昇格できません。別PRのactivation packageが必要です",
    });
  }

  if (activeEdgeIds.has(family.id)) {
    issues.push({
      severity: "error",
      code: "catalog_active_edge_overlap",
      target: `${target}.id`,
      message: "catalog family idがactive Edge Registryと重複しています。catalog件数をactive Edge数へ混入させないでください",
    });
  }

  if (!family.activationGate) {
    issues.push({
      severity: "error",
      code: "missing_activation_gate",
      target: `${target}.activationGate`,
      message: "catalog段階でも未充足gateを明示してください",
    });
  } else {
    const expectedKeys = [
      "objectiveTriggerDefined",
      "entityMappingAvailable",
      "pitTimestampsAvailable",
      "executablePriceRouteAvailable",
      "samplePathAvailable",
      "dataRightsReviewed",
      "falsificationDefined",
    ];
    for (const key of expectedKeys) {
      if (typeof family.activationGate[key] !== "boolean") {
        issues.push({
          severity: "error",
          code: "incomplete_activation_gate",
          target: `${target}.activationGate.${key}`,
          message: "activation gateは全項目をtrue/falseで明示してください",
        });
      }
    }
    if (family.activationGate.falsificationDefined !== true) {
      issues.push({
        severity: "error",
        code: "falsification_gate_not_met",
        target: `${target}.activationGate.falsificationDefined`,
        message: "catalog登録時点で反証条件は定義済みである必要があります",
      });
    }
    for (const key of expectedKeys.filter((key) => key !== "falsificationDefined")) {
      if (family.activationGate[key] === true) {
        issues.push({
          severity: "error",
          code: "premature_activation_claim",
          target: `${target}.activationGate.${key}`,
          message: "catalogでは未検証gateをtrueにせず、証拠付きactivation PRで更新してください",
        });
      }
    }
  }

  issues.push(...duplicatedArrayIssues(family, index));
  return issues;
}

export function validateEdgeFamilyCatalog(
  value: unknown,
  schema: JsonSchema,
  activeEdgeIds: ReadonlySet<string> = new Set(),
): CatalogIssue[] {
  const issues = schemaIssues(value, schema, CATALOG_PATHS.edgeFamilies);
  if (issues.length > 0) return issues;

  const catalog = value as EdgeFamilyCatalog;
  issues.push(
    ...duplicateIssues(
      catalog.families.map((family) => family.id),
      "duplicate_family_id",
      CATALOG_PATHS.edgeFamilies,
      "family id",
    ),
    ...duplicateIssues(
      catalog.families.map((family) => family.title),
      "duplicate_family_title",
      CATALOG_PATHS.edgeFamilies,
      "family title",
    ),
  );
  catalog.families.forEach((family, index) => {
    issues.push(...semanticEdgeFamilyIssues(family, index, activeEdgeIds));
  });
  return sortIssues(issues);
}

export function loadYaml(path: string): unknown {
  return load(readFileSync(path, "utf-8"));
}

export function loadJsonSchema(path: string): JsonSchema {
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

export function loadActiveEdgeIds(dir = CATALOG_PATHS.activeEdgesDir): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(dir)) return ids;
  for (const filename of readdirSync(dir).filter((name) => name.endsWith(".yml")).sort()) {
    const raw = loadYaml(join(dir, filename));
    if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).id === "string") {
      ids.add((raw as Record<string, string>).id);
    }
  }
  return ids;
}

export function validateRepositoryCatalogs(): {
  dataSourceIssues: CatalogIssue[];
  edgeFamilyIssues: CatalogIssue[];
  sourceCount: number;
  familyCount: number;
  activeEdgeCount: number;
} {
  const dataSourceValue = loadYaml(CATALOG_PATHS.dataSources);
  const edgeFamilyValue = loadYaml(CATALOG_PATHS.edgeFamilies);
  const activeEdgeIds = loadActiveEdgeIds();

  const dataSourceIssues = validateDataSourceCatalog(
    dataSourceValue,
    loadJsonSchema(CATALOG_PATHS.dataSourceSchema),
  );
  const edgeFamilyIssues = validateEdgeFamilyCatalog(
    edgeFamilyValue,
    loadJsonSchema(CATALOG_PATHS.edgeFamilySchema),
    activeEdgeIds,
  );

  return {
    dataSourceIssues,
    edgeFamilyIssues,
    sourceCount: (dataSourceValue as DataSourceCatalog).sources?.length ?? 0,
    familyCount: (edgeFamilyValue as EdgeFamilyCatalog).families?.length ?? 0,
    activeEdgeCount: activeEdgeIds.size,
  };
}

export function sortIssues(issues: CatalogIssue[]): CatalogIssue[] {
  return [...issues].sort((a, b) => {
    const left = `${a.severity}|${a.code}|${a.target}|${a.message}`;
    const right = `${b.severity}|${b.code}|${b.target}|${b.message}`;
    return left.localeCompare(right);
  });
}

export function formatCatalogIssues(issues: CatalogIssue[]): string {
  return sortIssues(issues)
    .map((issue) => `  - [${issue.severity}] ${issue.code} ${issue.target}: ${issue.message}`)
    .join("\n");
}

export function catalogFingerprint(value: unknown): string {
  return stableStringify(value);
}

export function formatSchemaErrorsForDebug(value: unknown, schema: JsonSchema): string {
  return formatErrors(validate(value, schema));
}
