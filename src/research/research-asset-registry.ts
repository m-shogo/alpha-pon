import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { load } from "js-yaml";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { buildOpaqueAuthorityView, type ResearchKnowledgeAuthorityView } from "./research-knowledge-authority-adapters.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import { formatErrors, validate, type JsonSchema } from "./schema.js";

export const RESEARCH_ASSET_REGISTRY_ROOT = "research/asset_registry";
export const RESEARCH_ASSET_SCHEMA_PATH = "research/schemas/research-asset.schema.json";
export const RESEARCH_ASSET_PROVENANCE_SCHEMA_PATH = "research/schemas/research-asset-provenance.schema.json";
export const RESEARCH_ASSET_MAX_RECORD_BYTES = 128 * 1024;

export type ResearchAssetType = "document" | "watch" | "implementation";
export type ResearchAssetStatus = "active" | "deprecated";

export interface ResearchAssetRecord {
  schemaVersion: 1;
  id: string;
  assetType: ResearchAssetType;
  path: string;
  status: ResearchAssetStatus;
  description: string;
}

export interface ResearchAssetProvenanceRecord {
  schemaVersion: 1;
  assetId: string;
  firstKnownAt: string;
  basis: "canonical_git_first_presence";
  sourceCommitSha: string;
  sourceCommitAt: string;
  sourcePath: string;
}

export interface ResearchAssetRegistryOptions {
  rootPath?: string;
  repositoryRootPath?: string;
  assetSchemaPath?: string;
  provenancePath?: string;
  provenanceSchemaPath?: string;
  maxRecordBytes?: number;
}

export interface ResearchAssetRegistryResult {
  records: readonly ResearchAssetRecord[];
  provenanceRecords: readonly ResearchAssetProvenanceRecord[];
  firstKnownAtById: Readonly<Record<string, string>>;
  missingProvenanceIds: readonly string[];
  issues: readonly ResearchKnowledgeIssue[];
}

export interface ResearchAssetAuthorityViews {
  document: ResearchKnowledgeAuthorityView;
  watch: ResearchKnowledgeAuthorityView;
  implementation: ResearchKnowledgeAuthorityView;
}

function issue(code: string, target: string, message: string): ResearchKnowledgeIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: readonly ResearchKnowledgeIssue[]): ResearchKnowledgeIssue[] {
  return [...issues].sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(
      `${right.code}|${right.target}|${right.message}`,
    ),
  );
}

function loadSchema(path: string): JsonSchema {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${path}: schema must be a regular non-symlink file`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path}: schema root must be an object`);
  }
  return parsed as JsonSchema;
}

function isCanonicalRepoPath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes("\\")) return false;
  const parts = path.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function readAssetRecords(
  rootPath: string,
  repositoryRootPath: string,
  schema: JsonSchema,
  maxRecordBytes: number,
): { records: ResearchAssetRecord[]; issues: ResearchKnowledgeIssue[] } {
  const issues: ResearchKnowledgeIssue[] = [];
  const assetsPath = join(rootPath, "assets");
  if (!existsSync(assetsPath)) return { records: [], issues };

  try {
    const stat = lstatSync(assetsPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return {
        records: [],
        issues: [issue(
          "research_asset_registry_assets_not_directory",
          assetsPath,
          "Research Asset assets root must be a regular non-symlink directory",
        )],
      };
    }
  } catch (error) {
    return {
      records: [],
      issues: [issue(
        "research_asset_registry_assets_read_failed",
        assetsPath,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }

  let entries;
  try {
    entries = readdirSync(assetsPath, { withFileTypes: true });
  } catch (error) {
    return {
      records: [],
      issues: [issue(
        "research_asset_registry_assets_read_failed",
        assetsPath,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }

  const candidates: ResearchAssetRecord[] = [];
  const pathById = new Map<string, string>();

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(assetsPath, entry.name);
    if (!entry.isFile()) {
      issues.push(issue(
        entry.isSymbolicLink() ? "research_asset_registry_record_symlink" : "research_asset_registry_nested_entry",
        path,
        "Research Asset records must be regular top-level YAML files; symlinks and nested entries are not allowed",
      ));
      continue;
    }
    if (!entry.name.endsWith(".yml")) {
      issues.push(issue(
        "research_asset_registry_unexpected_file",
        path,
        "Research Asset registry accepts only .yml record files",
      ));
      continue;
    }

    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        issues.push(issue(
          "research_asset_registry_record_not_regular_file",
          path,
          "Research Asset record must be a regular non-symlink file",
        ));
        continue;
      }
      if (stat.size > maxRecordBytes) {
        issues.push(issue(
          "research_asset_registry_record_too_large",
          path,
          `Research Asset metadata exceeds ${maxRecordBytes} bytes`,
        ));
        continue;
      }

      const raw = load(readFileSync(path, "utf-8")) as unknown;
      const errors = validate(raw, schema);
      if (errors.length > 0) {
        issues.push(issue(
          "research_asset_registry_schema_invalid",
          path,
          formatErrors(errors),
        ));
        continue;
      }

      const record = raw as ResearchAssetRecord;
      const expectedFilename = `${record.id}.yml`;
      if (basename(path) !== expectedFilename) {
        issues.push(issue(
          "research_asset_registry_filename_id_mismatch",
          path,
          `filename must be ${expectedFilename}`,
        ));
        continue;
      }
      if (!isCanonicalRepoPath(record.path)) {
        issues.push(issue(
          "research_asset_registry_noncanonical_path",
          path,
          `asset path must be a canonical repository-relative path; found ${record.path}`,
        ));
        continue;
      }

      const targetPath = join(repositoryRootPath, record.path);
      if (!existsSync(targetPath)) {
        issues.push(issue(
          "research_asset_registry_target_missing",
          path,
          `registered asset target does not exist: ${record.path}`,
        ));
        continue;
      }
      const targetStat = lstatSync(targetPath);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
        issues.push(issue(
          "research_asset_registry_target_not_regular_file",
          path,
          `registered asset target must be a regular non-symlink file: ${record.path}`,
        ));
        continue;
      }

      candidates.push(record);
      pathById.set(record.id, path);
    } catch (error) {
      issues.push(issue(
        "research_asset_registry_record_read_failed",
        path,
        error instanceof Error ? error.message : String(error),
      ));
    }
  }

  const idsByTargetPath = new Map<string, string[]>();
  for (const record of candidates) {
    idsByTargetPath.set(record.path, [...(idsByTargetPath.get(record.path) ?? []), record.id]);
  }
  const duplicateIds = new Set<string>();
  for (const [targetPath, ids] of idsByTargetPath) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      duplicateIds.add(id);
      issues.push(issue(
        "research_asset_registry_duplicate_target_path",
        pathById.get(id) ?? `research_asset:${id}`,
        `repository path ${targetPath} is already claimed by multiple Research Asset IDs: ${ids.sort().join(", ")}`,
      ));
    }
  }

  return {
    records: candidates.filter((record) => !duplicateIds.has(record.id)).sort((a, b) => a.id.localeCompare(b.id)),
    issues,
  };
}

function parseJsonl(content: string, path: string): {
  values: unknown[];
  issues: ResearchKnowledgeIssue[];
} {
  const values: unknown[] = [];
  const issues: ResearchKnowledgeIssue[] = [];
  for (const [index, line] of content.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      values.push(JSON.parse(trimmed) as unknown);
    } catch (error) {
      issues.push(issue(
        "research_asset_provenance_invalid_json",
        `${path}:${index + 1}`,
        error instanceof Error ? error.message : String(error),
      ));
    }
  }
  return { values, issues };
}

function validateProvenanceRecords(
  rawRecords: readonly unknown[],
  assetIds: readonly string[],
  schema: JsonSchema,
): {
  records: ResearchAssetProvenanceRecord[];
  firstKnownAtById: Record<string, string>;
  missingProvenanceIds: string[];
  issues: ResearchKnowledgeIssue[];
} {
  const issues: ResearchKnowledgeIssue[] = [];
  const structural: ResearchAssetProvenanceRecord[] = [];
  for (const [index, raw] of rawRecords.entries()) {
    const errors = validate(raw, schema);
    if (errors.length > 0) {
      issues.push(issue(
        "research_asset_provenance_schema_invalid",
        `research_asset_provenance:${index + 1}`,
        formatErrors(errors),
      ));
      continue;
    }
    structural.push(raw as ResearchAssetProvenanceRecord);
  }

  const declared = new Set(assetIds);
  const counts = new Map<string, number>();
  for (const record of structural) {
    counts.set(record.assetId, (counts.get(record.assetId) ?? 0) + 1);
  }

  const valid = new Map<string, ResearchAssetProvenanceRecord>();
  for (const record of structural) {
    const target = `research_asset_provenance:${record.assetId}`;
    let recordValid = true;
    if ((counts.get(record.assetId) ?? 0) > 1) {
      issues.push(issue(
        "research_asset_provenance_duplicate_asset",
        target,
        `Research Asset ${record.assetId} has more than one first-known provenance fact`,
      ));
      recordValid = false;
    }
    if (!declared.has(record.assetId)) {
      issues.push(issue(
        "research_asset_provenance_unknown_asset",
        target,
        `provenance exists for undeclared Research Asset ${record.assetId}`,
      ));
      recordValid = false;
    }
    if (!isCanonicalRepoPath(record.sourcePath)) {
      issues.push(issue(
        "research_asset_provenance_noncanonical_source_path",
        target,
        `sourcePath must be a canonical repository-relative path; found ${record.sourcePath}`,
      ));
      recordValid = false;
    }
    if (compareExplicitIso8601Instants(
      record.firstKnownAt,
      record.sourceCommitAt,
      `${target}.firstKnownAt`,
      `${target}.sourceCommitAt`,
    ) !== 0) {
      issues.push(issue(
        "research_asset_provenance_time_mismatch",
        target,
        "canonical_git_first_presence requires firstKnownAt to equal sourceCommitAt",
      ));
      recordValid = false;
    }
    if (recordValid) valid.set(record.assetId, record);
  }

  const records = [...valid.values()].sort((left, right) =>
    compareExplicitIso8601Instants(
      left.firstKnownAt,
      right.firstKnownAt,
      `research_asset_provenance:${left.assetId}.firstKnownAt`,
      `research_asset_provenance:${right.assetId}.firstKnownAt`,
    ) || left.assetId.localeCompare(right.assetId),
  );
  const firstKnownAtById = Object.fromEntries(
    [...valid.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, record]) => [id, record.firstKnownAt]),
  );
  const missingProvenanceIds = [...assetIds].sort().filter((id) => !valid.has(id));
  return { records, firstKnownAtById, missingProvenanceIds, issues };
}

function readProvenance(
  path: string,
  assetIds: readonly string[],
  schema: JsonSchema,
): {
  records: ResearchAssetProvenanceRecord[];
  firstKnownAtById: Record<string, string>;
  missingProvenanceIds: string[];
  issues: ResearchKnowledgeIssue[];
} {
  if (!existsSync(path)) {
    return {
      records: [],
      firstKnownAtById: {},
      missingProvenanceIds: [...assetIds].sort(),
      issues: [],
    };
  }
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return {
        records: [],
        firstKnownAtById: {},
        missingProvenanceIds: [...assetIds].sort(),
        issues: [issue(
          "research_asset_provenance_not_regular_file",
          path,
          "Research Asset provenance must be a regular non-symlink file",
        )],
      };
    }
    const content = readFileSync(path, "utf-8");
    if (content.length > 0 && !content.endsWith("\n")) {
      return {
        records: [],
        firstKnownAtById: {},
        missingProvenanceIds: [...assetIds].sort(),
        issues: [issue(
          "research_asset_provenance_partial_tail",
          path,
          "Research Asset provenance JSONL must end with a newline; partial write is possible",
        )],
      };
    }
    const parsed = parseJsonl(content, path);
    if (parsed.issues.length > 0) {
      return {
        records: [],
        firstKnownAtById: {},
        missingProvenanceIds: [...assetIds].sort(),
        issues: parsed.issues,
      };
    }
    return validateProvenanceRecords(parsed.values, assetIds, schema);
  } catch (error) {
    return {
      records: [],
      firstKnownAtById: {},
      missingProvenanceIds: [...assetIds].sort(),
      issues: [issue(
        "research_asset_provenance_read_failed",
        path,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }
}

export function readResearchAssetRegistry(
  options: ResearchAssetRegistryOptions = {},
): ResearchAssetRegistryResult {
  const rootPath = options.rootPath ?? RESEARCH_ASSET_REGISTRY_ROOT;
  const repositoryRootPath = options.repositoryRootPath ?? ".";
  const assetSchemaPath = options.assetSchemaPath ?? RESEARCH_ASSET_SCHEMA_PATH;
  const provenancePath = options.provenancePath ?? join(rootPath, "provenance.jsonl");
  const provenanceSchemaPath = options.provenanceSchemaPath ?? RESEARCH_ASSET_PROVENANCE_SCHEMA_PATH;
  const maxRecordBytes = options.maxRecordBytes ?? RESEARCH_ASSET_MAX_RECORD_BYTES;

  if (!existsSync(rootPath)) {
    return {
      records: [],
      provenanceRecords: [],
      firstKnownAtById: {},
      missingProvenanceIds: [],
      issues: [issue(
        "research_asset_registry_root_missing",
        rootPath,
        "canonical Research Asset Registry root is missing",
      )],
    };
  }

  try {
    const rootStat = lstatSync(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return {
        records: [],
        provenanceRecords: [],
        firstKnownAtById: {},
        missingProvenanceIds: [],
        issues: [issue(
          "research_asset_registry_root_not_directory",
          rootPath,
          "canonical Research Asset Registry root must be a regular non-symlink directory",
        )],
      };
    }

    const assetSchema = loadSchema(assetSchemaPath);
    const provenanceSchema = loadSchema(provenanceSchemaPath);
    const assetRead = readAssetRecords(rootPath, repositoryRootPath, assetSchema, maxRecordBytes);
    const assetIds = assetRead.records.map((record) => record.id);
    const provenanceRead = readProvenance(provenancePath, assetIds, provenanceSchema);
    return {
      records: assetRead.records,
      provenanceRecords: provenanceRead.records,
      firstKnownAtById: provenanceRead.firstKnownAtById,
      missingProvenanceIds: provenanceRead.missingProvenanceIds,
      issues: sortIssues([...assetRead.issues, ...provenanceRead.issues]),
    };
  } catch (error) {
    return {
      records: [],
      provenanceRecords: [],
      firstKnownAtById: {},
      missingProvenanceIds: [],
      issues: [issue(
        "research_asset_registry_read_failed",
        rootPath,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }
}

export function buildResearchAssetAuthorityViews(
  registry: ResearchAssetRegistryResult,
): ResearchAssetAuthorityViews {
  const idsFor = (type: ResearchAssetType): string[] =>
    registry.records.filter((record) => record.assetType === type).map((record) => record.id).sort();
  const firstKnownFor = (ids: readonly string[]): Record<string, string> => {
    const allowed = new Set(ids);
    return Object.fromEntries(
      Object.entries(registry.firstKnownAtById)
        .filter(([id]) => allowed.has(id))
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  };

  const documentIds = idsFor("document");
  const watchIds = idsFor("watch");
  const implementationIds = idsFor("implementation");
  const document = buildOpaqueAuthorityView("document", documentIds, firstKnownFor(documentIds));

  return {
    document: {
      ...document,
      issues: sortIssues([...registry.issues, ...document.issues]),
    },
    watch: buildOpaqueAuthorityView("watch", watchIds, firstKnownFor(watchIds)),
    implementation: buildOpaqueAuthorityView("implementation", implementationIds, firstKnownFor(implementationIds)),
  };
}
