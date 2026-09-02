import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { dump } from "js-yaml";
import {
  RESEARCH_KNOWLEDGE_CATALOG_MAX_RECORD_BYTES,
  RESEARCH_KNOWLEDGE_CATALOG_ROOT,
  RESEARCH_KNOWLEDGE_CATALOG_SPECS,
  readResearchKnowledgeCatalogRepository,
  type ResearchKnowledgeCatalogCollection,
} from "./research-knowledge-catalog-repository.js";
import { formatErrors, validate, type JsonSchema } from "./schema.js";

export class ResearchKnowledgeCatalogWriteError extends Error {
  constructor(
    public readonly code: string,
    public readonly target: string,
    message: string,
  ) {
    super(`${code} — ${target}: ${message}`);
    this.name = "ResearchKnowledgeCatalogWriteError";
  }
}

export interface CreateResearchKnowledgeCatalogRecordOptions {
  rootPath?: string;
  maxRecordBytes?: number;
}

export interface CreateResearchKnowledgeCatalogRecordResult {
  path: string;
  bytes: number;
}

function specFor(collection: ResearchKnowledgeCatalogCollection) {
  const spec = RESEARCH_KNOWLEDGE_CATALOG_SPECS.find((entry) => entry.collection === collection);
  if (!spec) throw new ResearchKnowledgeCatalogWriteError(
    "research_catalog_unknown_collection",
    collection,
    `No persistence contract exists for Catalog collection ${collection}`,
  );
  return spec;
}

function loadSchema(path: string): JsonSchema {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_schema_read_failed",
      path,
      "schema must be a standalone regular file",
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_schema_read_failed",
      path,
      "schema root must be an object",
    );
  }
  return raw as JsonSchema;
}

function assertSafeRoot(rootPath: string): void {
  if (!existsSync(rootPath)) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_root_missing",
      rootPath,
      "Catalog root must already exist; writer will not silently create a new authority root",
    );
  }
  const root = lstatSync(rootPath);
  if (root.isSymbolicLink()) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_root_symlink",
      rootPath,
      "Catalog root must not be a symlink",
    );
  }
  if (!root.isDirectory()) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_root_not_directory",
      rootPath,
      "Catalog root must be a directory",
    );
  }
}

function assertCatalogHealthy(rootPath: string, maxRecordBytes: number): void {
  const current = readResearchKnowledgeCatalogRepository({ rootPath, maxRecordBytes });
  if (current.issues.length > 0) {
    const first = current.issues[0];
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_write_blocked_by_existing_issues",
      rootPath,
      `Catalog has ${current.issues.length} existing issue(s); first: ${first.code} ${first.target} ${first.message}`,
    );
  }
}

function assertIdNotPresent(rootPath: string, id: string): void {
  for (const spec of RESEARCH_KNOWLEDGE_CATALOG_SPECS) {
    const candidate = join(rootPath, spec.directory, `${id}.yml`);
    if (existsSync(candidate)) {
      throw new ResearchKnowledgeCatalogWriteError(
        "research_catalog_id_already_exists",
        candidate,
        `Research-owned id ${id} already has a Catalog file; create-only writer never overwrites identities`,
      );
    }
  }
}

function assertSafeDirectory(directoryPath: string): void {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: false });
    return;
  }
  const directory = lstatSync(directoryPath);
  if (directory.isSymbolicLink()) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_directory_symlink",
      directoryPath,
      "Catalog type directory must not be a symlink",
    );
  }
  if (!directory.isDirectory()) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_type_path_not_directory",
      directoryPath,
      "Catalog type path must be a directory",
    );
  }
}

export function createResearchKnowledgeCatalogRecord(
  collection: ResearchKnowledgeCatalogCollection,
  record: unknown,
  options: CreateResearchKnowledgeCatalogRecordOptions = {},
): CreateResearchKnowledgeCatalogRecordResult {
  const rootPath = options.rootPath ?? RESEARCH_KNOWLEDGE_CATALOG_ROOT;
  const maxRecordBytes = options.maxRecordBytes ?? RESEARCH_KNOWLEDGE_CATALOG_MAX_RECORD_BYTES;
  assertSafeRoot(rootPath);
  assertCatalogHealthy(rootPath, maxRecordBytes);

  const spec = specFor(collection);
  const schema = loadSchema(spec.schemaPath);
  const errors = validate(record, schema);
  if (errors.length > 0) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_schema_invalid",
      collection,
      formatErrors(errors),
    );
  }
  if (!record || typeof record !== "object" || Array.isArray(record) || typeof (record as { id?: unknown }).id !== "string") {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_record_root_invalid",
      collection,
      "Catalog record must be one schema-valid object with a string id",
    );
  }

  const id = (record as { id: string }).id;
  assertIdNotPresent(rootPath, id);

  const directoryPath = join(rootPath, spec.directory);
  assertSafeDirectory(directoryPath);
  const path = join(directoryPath, `${id}.yml`);
  const content = dump(record, {
    noRefs: true,
    sortKeys: false,
    lineWidth: 120,
    noCompatMode: true,
  });
  const bytes = Buffer.byteLength(content, "utf-8");
  if (bytes > maxRecordBytes) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_record_too_large",
      path,
      `serialized Catalog metadata is ${bytes} bytes; maximum is ${maxRecordBytes}`,
    );
  }

  try {
    writeFileSync(path, content, { encoding: "utf-8", flag: "wx", mode: 0o644 });
  } catch (error) {
    throw new ResearchKnowledgeCatalogWriteError(
      "research_catalog_create_failed",
      path,
      error instanceof Error ? error.message : String(error),
    );
  }

  return { path, bytes };
}
