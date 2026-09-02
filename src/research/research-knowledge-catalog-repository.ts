import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, join } from "node:path";
import { load } from "js-yaml";
import { formatErrors, validate, type JsonSchema } from "./schema.js";
import {
  emptyResearchKnowledgeOwnedSnapshot,
  type ResearchKnowledgeOwnedSnapshot,
} from "./research-knowledge-snapshot-loader.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import type {
  ResearchCaseRecord,
  ResearchComponentRecord,
  ResearchFamilyRecord,
  ResearchItemRecord,
  ResearchLineageRecord,
  ResearchMechanismRecord,
  ResearchObservationRecord,
  ResearchOpportunityRecord,
  ResearchQuestionRecord,
  ResearchRelationRecord,
  ResearchStudyRecord,
  ResearchStudyResultRecord,
  ResearchStudySampleManifestRecord,
} from "./research-knowledge-types.js";

export const RESEARCH_KNOWLEDGE_CATALOG_ROOT = "research/knowledge_catalog";
export const RESEARCH_KNOWLEDGE_CATALOG_MAX_RECORD_BYTES = 256 * 1024;

export type ResearchKnowledgeCatalogCollection =
  | "researchItems"
  | "researchQuestions"
  | "observations"
  | "mechanisms"
  | "researchFamilies"
  | "researchComponents"
  | "cases"
  | "studies"
  | "sampleManifests"
  | "studyResults"
  | "opportunities"
  | "relations"
  | "lineages";

interface CatalogSpec {
  collection: ResearchKnowledgeCatalogCollection;
  directory: string;
  schemaPath: string;
}

export const RESEARCH_KNOWLEDGE_CATALOG_SPECS: readonly CatalogSpec[] = [
  { collection: "researchItems", directory: "research_items", schemaPath: "research/schemas/research-item.schema.json" },
  { collection: "researchQuestions", directory: "research_questions", schemaPath: "research/schemas/research-question.schema.json" },
  { collection: "observations", directory: "observations", schemaPath: "research/schemas/research-observation.schema.json" },
  { collection: "mechanisms", directory: "mechanisms", schemaPath: "research/schemas/research-mechanism.schema.json" },
  { collection: "researchFamilies", directory: "research_families", schemaPath: "research/schemas/research-family.schema.json" },
  { collection: "researchComponents", directory: "research_components", schemaPath: "research/schemas/research-component.schema.json" },
  { collection: "cases", directory: "cases", schemaPath: "research/schemas/research-case.schema.json" },
  { collection: "studies", directory: "studies", schemaPath: "research/schemas/research-study.schema.json" },
  { collection: "sampleManifests", directory: "sample_manifests", schemaPath: "research/schemas/research-study-sample-manifest.schema.json" },
  { collection: "studyResults", directory: "study_results", schemaPath: "research/schemas/research-study-result.schema.json" },
  { collection: "opportunities", directory: "opportunities", schemaPath: "research/schemas/research-opportunity.schema.json" },
  { collection: "relations", directory: "relations", schemaPath: "research/schemas/research-relation.schema.json" },
  { collection: "lineages", directory: "lineages", schemaPath: "research/schemas/research-lineage.schema.json" },
] as const;

interface CatalogRow {
  collection: ResearchKnowledgeCatalogCollection;
  path: string;
  record: { id: string } & Record<string, unknown>;
}

export interface ResearchKnowledgeCatalogRepositoryOptions {
  rootPath?: string;
  maxRecordBytes?: number;
}

export interface ResearchKnowledgeCatalogRepositoryResult {
  snapshot: ResearchKnowledgeOwnedSnapshot;
  issues: readonly ResearchKnowledgeIssue[];
  counts: Readonly<Record<ResearchKnowledgeCatalogCollection, number>>;
  totalCount: number;
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

function emptyCounts(): Record<ResearchKnowledgeCatalogCollection, number> {
  return {
    researchItems: 0,
    researchQuestions: 0,
    observations: 0,
    mechanisms: 0,
    researchFamilies: 0,
    researchComponents: 0,
    cases: 0,
    studies: 0,
    sampleManifests: 0,
    studyResults: 0,
    opportunities: 0,
    relations: 0,
    lineages: 0,
  };
}

function loadSchema(path: string): JsonSchema {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`${path}: schema must be a standalone regular file`);
  }
  const value = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: schema root must be an object`);
  }
  return value as JsonSchema;
}

function catalogRootIssue(rootPath: string): ResearchKnowledgeIssue[] {
  if (!existsSync(rootPath)) {
    return [issue(
      "research_catalog_root_missing",
      rootPath,
      "canonical Research Knowledge Catalog root is missing; disappearing research must never be treated as an empty catalog",
    )];
  }
  const root = lstatSync(rootPath);
  if (root.isSymbolicLink()) {
    return [issue(
      "research_catalog_root_symlink",
      rootPath,
      "Research Knowledge Catalog root must be a real repository directory, not a symlink",
    )];
  }
  if (!root.isDirectory()) {
    return [issue(
      "research_catalog_root_not_directory",
      rootPath,
      "Research Knowledge Catalog root must be a directory",
    )];
  }
  return [];
}

function readCollection(
  rootPath: string,
  spec: CatalogSpec,
  maxRecordBytes: number,
): { rows: CatalogRow[]; issues: ResearchKnowledgeIssue[] } {
  const rows: CatalogRow[] = [];
  const issues: ResearchKnowledgeIssue[] = [];
  const directoryPath = join(rootPath, spec.directory);

  // Git does not preserve empty directories. Missing type directories therefore mean zero records.
  if (!existsSync(directoryPath)) return { rows, issues };

  const directory = lstatSync(directoryPath);
  if (directory.isSymbolicLink()) {
    return {
      rows,
      issues: [issue(
        "research_catalog_directory_symlink",
        directoryPath,
        "Catalog type directory must not be a symlink",
      )],
    };
  }
  if (!directory.isDirectory()) {
    return {
      rows,
      issues: [issue(
        "research_catalog_type_path_not_directory",
        directoryPath,
        "Catalog type path must be a directory",
      )],
    };
  }

  let schema: JsonSchema;
  try {
    schema = loadSchema(spec.schemaPath);
  } catch (error) {
    return {
      rows,
      issues: [issue(
        "research_catalog_schema_read_failed",
        spec.schemaPath,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }

  for (const entry of readdirSync(directoryPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directoryPath, entry.name);
    if (entry.name === ".gitkeep") continue;

    if (entry.isSymbolicLink()) {
      issues.push(issue(
        "research_catalog_record_symlink",
        path,
        "Catalog records must be repository files, not symlinks",
      ));
      continue;
    }
    if (!entry.isFile()) {
      issues.push(issue(
        "research_catalog_unexpected_nested_path",
        path,
        "Catalog type directories are flat; nested directories and special files are not allowed",
      ));
      continue;
    }
    if (!entry.name.endsWith(".yml")) {
      issues.push(issue(
        "research_catalog_unexpected_file",
        path,
        "Catalog record files must use the .yml extension",
      ));
      continue;
    }

    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      issues.push(issue(
        "research_catalog_record_stat_failed",
        path,
        error instanceof Error ? error.message : String(error),
      ));
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      issues.push(issue(
        "research_catalog_record_not_regular_file",
        path,
        "Catalog record must be a standalone regular file",
      ));
      continue;
    }
    if (stat.size > maxRecordBytes) {
      issues.push(issue(
        "research_catalog_record_too_large",
        path,
        `Catalog metadata file is ${stat.size} bytes; maximum is ${maxRecordBytes}. Large evidence/content belongs in its existing authority, not the Catalog`,
      ));
      continue;
    }

    let raw: unknown;
    try {
      raw = load(readFileSync(path, "utf-8"), { filename: path });
    } catch (error) {
      issues.push(issue(
        "research_catalog_invalid_yaml",
        path,
        error instanceof Error ? error.message : String(error),
      ));
      continue;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push(issue(
        "research_catalog_record_root_invalid",
        path,
        "Catalog YAML root must be one object record",
      ));
      continue;
    }

    const schemaErrors = validate(raw, schema);
    if (schemaErrors.length > 0) {
      issues.push(issue(
        "research_catalog_schema_invalid",
        path,
        formatErrors(schemaErrors),
      ));
      continue;
    }

    const record = raw as { id: string } & Record<string, unknown>;
    const expectedFilename = `${record.id}.yml`;
    if (basename(path) !== expectedFilename) {
      issues.push(issue(
        "research_catalog_filename_id_mismatch",
        path,
        `filename must be ${expectedFilename} for record id ${record.id}`,
      ));
      continue;
    }

    rows.push({ collection: spec.collection, path, record });
  }

  return { rows, issues };
}

function withoutGlobalIdCollisions(
  rows: readonly CatalogRow[],
): { rows: CatalogRow[]; issues: ResearchKnowledgeIssue[] } {
  const byId = new Map<string, CatalogRow[]>();
  for (const row of rows) byId.set(row.record.id, [...(byId.get(row.record.id) ?? []), row]);

  const duplicateIds = new Set<string>();
  const issues: ResearchKnowledgeIssue[] = [];
  for (const [id, matches] of [...byId.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (matches.length < 2) continue;
    duplicateIds.add(id);
    const locations = matches.map((row) => `${row.collection}:${row.path}`).sort().join(", ");
    for (const row of matches) {
      issues.push(issue(
        "research_catalog_duplicate_owned_id",
        row.path,
        `Research-owned id ${id} appears more than once across Catalog collections: ${locations}`,
      ));
    }
  }

  return {
    rows: rows.filter((row) => !duplicateIds.has(row.record.id)),
    issues,
  };
}

function recordsFor<T>(
  rows: readonly CatalogRow[],
  collection: ResearchKnowledgeCatalogCollection,
): T[] {
  return rows
    .filter((row) => row.collection === collection)
    .map((row) => row.record as T)
    .sort((left, right) => (left as { id: string }).id.localeCompare((right as { id: string }).id));
}

export function readResearchKnowledgeCatalogRepository(
  options: ResearchKnowledgeCatalogRepositoryOptions = {},
): ResearchKnowledgeCatalogRepositoryResult {
  const rootPath = options.rootPath ?? RESEARCH_KNOWLEDGE_CATALOG_ROOT;
  const maxRecordBytes = options.maxRecordBytes ?? RESEARCH_KNOWLEDGE_CATALOG_MAX_RECORD_BYTES;
  const rootIssues = catalogRootIssue(rootPath);
  if (rootIssues.length > 0) {
    return {
      snapshot: emptyResearchKnowledgeOwnedSnapshot(),
      issues: sortIssues(rootIssues),
      counts: emptyCounts(),
      totalCount: 0,
    };
  }

  const rawRows: CatalogRow[] = [];
  const issues: ResearchKnowledgeIssue[] = [];
  for (const spec of RESEARCH_KNOWLEDGE_CATALOG_SPECS) {
    const result = readCollection(rootPath, spec, maxRecordBytes);
    rawRows.push(...result.rows);
    issues.push(...result.issues);
  }

  const collisionFree = withoutGlobalIdCollisions(rawRows);
  issues.push(...collisionFree.issues);
  const rows = collisionFree.rows;

  const snapshot: ResearchKnowledgeOwnedSnapshot = {
    researchItems: recordsFor<ResearchItemRecord>(rows, "researchItems"),
    researchQuestions: recordsFor<ResearchQuestionRecord>(rows, "researchQuestions"),
    observations: recordsFor<ResearchObservationRecord>(rows, "observations"),
    mechanisms: recordsFor<ResearchMechanismRecord>(rows, "mechanisms"),
    researchFamilies: recordsFor<ResearchFamilyRecord>(rows, "researchFamilies"),
    researchComponents: recordsFor<ResearchComponentRecord>(rows, "researchComponents"),
    cases: recordsFor<ResearchCaseRecord>(rows, "cases"),
    studies: recordsFor<ResearchStudyRecord>(rows, "studies"),
    sampleManifests: recordsFor<ResearchStudySampleManifestRecord>(rows, "sampleManifests"),
    studyResults: recordsFor<ResearchStudyResultRecord>(rows, "studyResults"),
    opportunities: recordsFor<ResearchOpportunityRecord>(rows, "opportunities"),
    relations: recordsFor<ResearchRelationRecord>(rows, "relations"),
    lineages: recordsFor<ResearchLineageRecord>(rows, "lineages"),
  };

  const counts = emptyCounts();
  for (const spec of RESEARCH_KNOWLEDGE_CATALOG_SPECS) {
    counts[spec.collection] = snapshot[spec.collection].length;
  }
  const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return {
    snapshot,
    issues: sortIssues(issues),
    counts,
    totalCount,
  };
}
