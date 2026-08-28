import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import {
  readResearchAssetRegistry,
  type ResearchAssetRegistryResult,
  type ResearchAssetType,
} from "./research-asset-registry.js";
import {
  readResearchKnowledgeCatalogRepository,
  type ResearchKnowledgeCatalogRepositoryResult,
} from "./research-knowledge-catalog-repository.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";

export const RESEARCH_ORPHAN_DOCUMENT_ROOTS = ["docs/research"] as const;
export const RESEARCH_ORPHAN_MAX_SCANNED_FILES = 10_000;
export const RESEARCH_ORPHAN_CANDIDATE_FINGERPRINT_VERSION = "research-orphan-candidate-v1" as const;

export type ResearchOrphanDiscoveryStage =
  | "structured_scan"
  | "explicit_reference_resolution";

export type ResearchOrphanClassification =
  | "existing_research_link_missing"
  | "unclassified";

export type ResearchOrphanCandidateKind =
  | "unregistered_asset"
  | "registered_asset_without_relation";

export interface ResearchOrphanCandidate {
  key: string;
  fingerprint: string;
  kind: ResearchOrphanCandidateKind;
  discoveryStage: ResearchOrphanDiscoveryStage;
  classification: ResearchOrphanClassification;
  assetType: ResearchAssetType;
  path: string;
  assetId?: string;
  reason: string;
}

export interface ResearchOrphanDiscoveryOptions {
  repositoryRootPath?: string;
  documentRoots?: readonly string[];
  maxScannedFiles?: number;
  assetRegistry?: ResearchAssetRegistryResult;
  catalogRepository?: ResearchKnowledgeCatalogRepositoryResult;
}

export interface ResearchOrphanDiscoveryResult {
  candidates: readonly ResearchOrphanCandidate[];
  scannedDocumentPaths: readonly string[];
  issues: readonly ResearchKnowledgeIssue[];
  stats: {
    scannedDocumentCount: number;
    unregisteredDocumentCount: number;
    unlinkedProvenAssetCount: number;
    totalCandidates: number;
  };
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

function fingerprint(parts: readonly string[]): string {
  const hash = createHash("sha256");
  hash.update(RESEARCH_ORPHAN_CANDIDATE_FINGERPRINT_VERSION);
  for (const part of parts) {
    hash.update("\0");
    hash.update(String(Buffer.byteLength(part, "utf8")));
    hash.update(":");
    hash.update(part);
  }
  return hash.digest("hex");
}

function isCanonicalRepositoryPath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes("\\")) return false;
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function toRepositoryPath(repositoryRootPath: string, absolutePath: string): string {
  return relative(repositoryRootPath, absolutePath).split(sep).join("/");
}

function isGeneratedDiscoveryPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.includes("generated")) return true;
  const name = basename(path).toLowerCase();
  return /(^|[._-])generated([._-]|$)/.test(name);
}

function scanDocumentPaths(
  repositoryRootPath: string,
  roots: readonly string[],
  maxScannedFiles: number,
): {
  paths: string[];
  contentHashByPath: Readonly<Record<string, string>>;
  issues: ResearchKnowledgeIssue[];
} {
  const paths: string[] = [];
  const contentHashByPath: Record<string, string> = {};
  const issues: ResearchKnowledgeIssue[] = [];
  let visitedFiles = 0;
  let fileLimitExceeded = false;

  const walk = (absoluteDirectory: string, repoDirectory: string): void => {
    if (fileLimitExceeded) return;

    let entries;
    try {
      entries = readdirSync(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      issues.push(issue(
        "research_orphan_scan_directory_read_failed",
        repoDirectory,
        error instanceof Error ? error.message : String(error),
      ));
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (fileLimitExceeded) return;

      const absolutePath = join(absoluteDirectory, entry.name);
      const repoPath = toRepositoryPath(repositoryRootPath, absolutePath);

      let stat;
      try {
        stat = lstatSync(absolutePath);
      } catch (error) {
        issues.push(issue(
          "research_orphan_scan_stat_failed",
          repoPath,
          error instanceof Error ? error.message : String(error),
        ));
        continue;
      }

      if (stat.isSymbolicLink()) {
        issues.push(issue(
          "research_orphan_scan_symlink_rejected",
          repoPath,
          "orphan discovery never follows symlinks",
        ));
        continue;
      }
      if (stat.isDirectory()) {
        walk(absolutePath, repoPath);
        continue;
      }
      if (!stat.isFile()) continue;

      visitedFiles += 1;
      if (visitedFiles > maxScannedFiles) {
        fileLimitExceeded = true;
        issues.push(issue(
          "research_orphan_scan_file_limit_exceeded",
          repoDirectory,
          `structured scan exceeded maxScannedFiles=${maxScannedFiles}`,
        ));
        return;
      }

      if (extname(entry.name).toLowerCase() !== ".md") continue;
      if (isGeneratedDiscoveryPath(repoPath)) continue;
      if (stat.nlink !== 1) {
        issues.push(issue(
          "research_orphan_scan_hard_link_rejected",
          repoPath,
          "orphan discovery refuses hard-linked Markdown because a triage fingerprint must identify one physical file",
        ));
        continue;
      }

      try {
        const bytes = readFileSync(absolutePath);
        contentHashByPath[repoPath] = createHash("sha256").update(bytes).digest("hex");
        paths.push(repoPath);
      } catch (error) {
        issues.push(issue(
          "research_orphan_scan_file_read_failed",
          repoPath,
          error instanceof Error ? error.message : String(error),
        ));
      }
    }
  };

  for (const root of [...new Set(roots)].sort()) {
    if (fileLimitExceeded) break;

    if (!isCanonicalRepositoryPath(root)) {
      issues.push(issue(
        "research_orphan_scan_root_noncanonical",
        root,
        "scan root must be a canonical repository-relative path",
      ));
      continue;
    }
    const absoluteRoot = join(repositoryRootPath, root);
    if (!existsSync(absoluteRoot)) {
      issues.push(issue(
        "research_orphan_scan_root_missing",
        root,
        "configured orphan-discovery root is missing",
      ));
      continue;
    }
    const stat = lstatSync(absoluteRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      issues.push(issue(
        "research_orphan_scan_root_not_directory",
        root,
        "configured orphan-discovery root must be a regular non-symlink directory",
      ));
      continue;
    }
    walk(absoluteRoot, root);
  }

  return {
    paths: [...new Set(paths)].sort(),
    contentHashByPath,
    issues: sortIssues(issues),
  };
}

function relationReferencedAssetIds(
  catalogRepository: ResearchKnowledgeCatalogRepositoryResult,
): Set<string> {
  const ids = new Set<string>();
  const assetTypes = new Set(["document", "watch", "implementation"]);
  for (const relation of catalogRepository.snapshot.relations) {
    if (assetTypes.has(relation.sourceType)) ids.add(relation.sourceId);
    if (assetTypes.has(relation.targetType)) ids.add(relation.targetId);
  }
  return ids;
}

function emptyResult(issues: readonly ResearchKnowledgeIssue[]): ResearchOrphanDiscoveryResult {
  return {
    candidates: [],
    scannedDocumentPaths: [],
    issues: sortIssues(issues),
    stats: {
      scannedDocumentCount: 0,
      unregisteredDocumentCount: 0,
      unlinkedProvenAssetCount: 0,
      totalCandidates: 0,
    },
  };
}

export function discoverResearchOrphans(
  options: ResearchOrphanDiscoveryOptions = {},
): ResearchOrphanDiscoveryResult {
  const repositoryRootPath = options.repositoryRootPath ?? ".";
  const documentRoots = options.documentRoots ?? RESEARCH_ORPHAN_DOCUMENT_ROOTS;
  const maxScannedFiles = options.maxScannedFiles ?? RESEARCH_ORPHAN_MAX_SCANNED_FILES;
  const assetRegistry = options.assetRegistry ?? readResearchAssetRegistry();
  const catalogRepository = options.catalogRepository ?? readResearchKnowledgeCatalogRepository();

  const authorityIssues = [...assetRegistry.issues, ...catalogRepository.issues];
  if (authorityIssues.length > 0) return emptyResult(authorityIssues);
  if (!Number.isSafeInteger(maxScannedFiles) || maxScannedFiles < 1) {
    return emptyResult([
      issue(
        "research_orphan_scan_file_limit_invalid",
        "maxScannedFiles",
        "maxScannedFiles must be a positive safe integer",
      ),
    ]);
  }

  const scan = scanDocumentPaths(repositoryRootPath, [...new Set(documentRoots)], maxScannedFiles);
  if (scan.issues.length > 0) return emptyResult(scan.issues);

  const registeredPaths = new Set(assetRegistry.records.map((record) => record.path));
  const candidates: ResearchOrphanCandidate[] = [];

  for (const path of scan.paths) {
    if (registeredPaths.has(path)) continue;
    const contentHash = scan.contentHashByPath[path];
    if (!contentHash) {
      return emptyResult([
        issue(
          "research_orphan_scan_content_hash_missing",
          path,
          "scanned Markdown must have a deterministic content hash before it can become a triage candidate",
        ),
      ]);
    }
    const key = `unregistered_asset:document:${path}`;
    candidates.push({
      key,
      fingerprint: fingerprint([key, "document", path, contentHash]),
      kind: "unregistered_asset",
      discoveryStage: "structured_scan",
      classification: "unclassified",
      assetType: "document",
      path,
      reason: "research-library Markdown is not represented by a Research Asset identity; triage only, do not auto-register",
    });
  }

  const referencedAssetIds = relationReferencedAssetIds(catalogRepository);
  const provenIds = new Set(Object.keys(assetRegistry.firstKnownAtById));
  for (const record of assetRegistry.records) {
    if (record.status !== "active") continue;
    if (!provenIds.has(record.id)) continue;
    if (referencedAssetIds.has(record.id)) continue;
    const key = `registered_asset_without_relation:${record.assetType}:${record.id}`;
    const firstKnownAt = assetRegistry.firstKnownAtById[record.id] ?? "";
    candidates.push({
      key,
      fingerprint: fingerprint([
        key,
        record.assetType,
        record.id,
        record.path,
        record.status,
        record.description,
        firstKnownAt,
      ]),
      kind: "registered_asset_without_relation",
      discoveryStage: "explicit_reference_resolution",
      classification: "existing_research_link_missing",
      assetType: record.assetType,
      path: record.path,
      assetId: record.id,
      reason: "active proven Research Asset has no Research Catalog relation; review whether it documents, operationalizes, or implements existing research",
    });
  }

  candidates.sort((left, right) => left.key.localeCompare(right.key));
  const unregisteredDocumentCount = candidates.filter((candidate) => candidate.kind === "unregistered_asset").length;
  const unlinkedProvenAssetCount = candidates.filter((candidate) => candidate.kind === "registered_asset_without_relation").length;

  return {
    candidates,
    scannedDocumentPaths: scan.paths,
    issues: [],
    stats: {
      scannedDocumentCount: scan.paths.length,
      unregisteredDocumentCount,
      unlinkedProvenAssetCount,
      totalCandidates: candidates.length,
    },
  };
}
