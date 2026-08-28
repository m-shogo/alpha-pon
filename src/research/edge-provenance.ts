import { existsSync, readFileSync } from "node:fs";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { formatErrors, validate, type JsonSchema } from "./schema.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";

export const EDGE_PROVENANCE_PATH = "research/edge_registry/provenance.jsonl";
export const EDGE_PROVENANCE_SCHEMA_PATH = "research/schemas/edge-provenance.schema.json";

export interface EdgeProvenanceRecord {
  schemaVersion: 1;
  edgeId: string;
  firstKnownAt: string;
  basis: "canonical_git_first_presence";
  sourceCommitSha: string;
  sourceCommitAt: string;
  sourcePath: string;
}

export interface EdgeProvenanceRepositoryResult {
  records: readonly EdgeProvenanceRecord[];
  firstKnownAtByEdge: Readonly<Record<string, string>>;
  /**
   * Formal Edge IDs that are registered but not yet safe to use in PIT Research Knowledge.
   * Missing coverage is intentionally not a repository error: a newly merged Edge cannot know
   * its canonical-main first-presence commit until after that merge exists. Any Research Graph
   * relation that references one of these IDs still fails closed because availability is absent.
   */
  missingEdgeIds: readonly string[];
  /** Structural or contradictory provenance facts only. */
  issues: readonly ResearchKnowledgeIssue[];
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

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function expectedEdgePath(edgeId: string): string {
  return `research/edge_registry/edges/${edgeId}.yml`;
}

function loadSchema(path: string): JsonSchema {
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path}: schema root must be an object`);
  }
  return parsed as JsonSchema;
}

function parseJsonl(content: string, path: string): {
  rows: Array<{ lineNumber: number; value: unknown }>;
  issues: ResearchKnowledgeIssue[];
} {
  const rows: Array<{ lineNumber: number; value: unknown }> = [];
  const issues: ResearchKnowledgeIssue[] = [];
  for (const [index, line] of content.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push({ lineNumber: index + 1, value: JSON.parse(trimmed) as unknown });
    } catch (error) {
      issues.push(issue(
        "research_edge_provenance_invalid_json",
        `${path}:${index + 1}`,
        error instanceof Error ? error.message : String(error),
      ));
    }
  }
  return { rows, issues };
}

export function validateEdgeProvenanceRecords(
  rawRecords: readonly unknown[],
  edgeIds: readonly string[],
  schema: JsonSchema,
): EdgeProvenanceRepositoryResult {
  const issues: ResearchKnowledgeIssue[] = [];
  const structuralRecords: EdgeProvenanceRecord[] = [];
  const canonicalEdgeIds = sortedUnique(edgeIds);
  const edgeIdSet = new Set(canonicalEdgeIds);

  rawRecords.forEach((raw, index) => {
    const errors = validate(raw, schema);
    if (errors.length > 0) {
      issues.push(issue(
        "research_edge_provenance_schema_invalid",
        `edge_provenance:${index + 1}`,
        formatErrors(errors),
      ));
      return;
    }
    structuralRecords.push(raw as EdgeProvenanceRecord);
  });

  const counts = new Map<string, number>();
  for (const record of structuralRecords) {
    counts.set(record.edgeId, (counts.get(record.edgeId) ?? 0) + 1);
  }

  const semanticallyValid = new Map<string, EdgeProvenanceRecord>();
  for (const record of structuralRecords) {
    const target = `edge_provenance:${record.edgeId}`;
    let valid = true;

    if ((counts.get(record.edgeId) ?? 0) > 1) {
      issues.push(issue(
        "research_edge_provenance_duplicate_edge",
        target,
        `Formal Edge ${record.edgeId} has more than one first-known provenance fact`,
      ));
      valid = false;
    }
    if (!edgeIdSet.has(record.edgeId)) {
      issues.push(issue(
        "research_edge_provenance_unknown_edge",
        target,
        `provenance exists for Edge ${record.edgeId}, but the Formal Edge Registry does not contain that ID`,
      ));
      valid = false;
    }
    const expectedPath = expectedEdgePath(record.edgeId);
    if (record.sourcePath !== expectedPath) {
      issues.push(issue(
        "research_edge_provenance_path_mismatch",
        target,
        `sourcePath must match the canonical Edge path ${expectedPath}; found ${record.sourcePath}`,
      ));
      valid = false;
    }
    if (compareExplicitIso8601Instants(
      record.firstKnownAt,
      record.sourceCommitAt,
      `${target}.firstKnownAt`,
      `${target}.sourceCommitAt`,
    ) !== 0) {
      issues.push(issue(
        "research_edge_provenance_time_mismatch",
        target,
        "canonical_git_first_presence requires firstKnownAt to equal sourceCommitAt",
      ));
      valid = false;
    }

    if (valid) semanticallyValid.set(record.edgeId, record);
  }

  const records = [...semanticallyValid.values()].sort((left, right) =>
    compareExplicitIso8601Instants(
      left.firstKnownAt,
      right.firstKnownAt,
      `edge_provenance:${left.edgeId}.firstKnownAt`,
      `edge_provenance:${right.edgeId}.firstKnownAt`,
    ) || left.edgeId.localeCompare(right.edgeId),
  );
  const firstKnownAtByEdge = Object.fromEntries(
    [...semanticallyValid.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([edgeId, record]) => [edgeId, record.firstKnownAt]),
  );
  const missingEdgeIds = canonicalEdgeIds.filter((edgeId) => !semanticallyValid.has(edgeId));

  return {
    records,
    firstKnownAtByEdge,
    missingEdgeIds,
    issues: sortIssues(issues),
  };
}

export function readEdgeProvenanceRepository(
  edgeIds: readonly string[],
  options: { path?: string; schemaPath?: string } = {},
): EdgeProvenanceRepositoryResult {
  const path = options.path ?? EDGE_PROVENANCE_PATH;
  const schemaPath = options.schemaPath ?? EDGE_PROVENANCE_SCHEMA_PATH;
  const canonicalEdgeIds = sortedUnique(edgeIds);

  if (!existsSync(path)) {
    return {
      records: [],
      firstKnownAtByEdge: {},
      missingEdgeIds: canonicalEdgeIds,
      issues: [],
    };
  }

  try {
    const content = readFileSync(path, "utf-8");
    if (content.length > 0 && !content.endsWith("\n")) {
      return {
        records: [],
        firstKnownAtByEdge: {},
        missingEdgeIds: canonicalEdgeIds,
        issues: [issue(
          "research_edge_provenance_partial_tail",
          path,
          "provenance JSONL must end with a newline; partial write is possible",
        )],
      };
    }
    const parsed = parseJsonl(content, path);
    if (parsed.issues.length > 0) {
      return {
        records: [],
        firstKnownAtByEdge: {},
        missingEdgeIds: canonicalEdgeIds,
        issues: sortIssues(parsed.issues),
      };
    }
    const schema = loadSchema(schemaPath);
    return validateEdgeProvenanceRecords(
      parsed.rows.map((row) => row.value),
      canonicalEdgeIds,
      schema,
    );
  } catch (error) {
    return {
      records: [],
      firstKnownAtByEdge: {},
      missingEdgeIds: canonicalEdgeIds,
      issues: [issue(
        "research_edge_provenance_read_failed",
        path,
        error instanceof Error ? error.message : String(error),
      )],
    };
  }
}
