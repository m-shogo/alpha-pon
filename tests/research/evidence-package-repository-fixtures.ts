// evidence-package repository テストの共通 fixture。
//
// validateEvidencePackageRepository は securityEntitiesPath 等を渡さないと
// **実リポジトリの research/ 配下を読む**。テストがそれに依存すると、
// 実データが変わった瞬間に無関係な理由で落ちる。
// 実際 evidence-package-repository-invalid-revision-ledger.test.ts は
// 依存パスを渡しておらず、2026-09-10 時点で
// governed_evidence_package_mismatch により activeHeadCount 0 になっていた。
//
// 依存データを一時ディレクトリへ書き出し、hermetic に検証するためのヘルパー。

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
} from "../../src/research/claim-contradiction-graph.js";
import {
  EVIDENCE_PACKAGE_CLAIM_ID,
  EVIDENCE_PACKAGE_CUTOFF,
  EVIDENCE_PACKAGE_EVIDENCE_ID,
  EVIDENCE_PACKAGE_ISSUER_ID,
} from "./evidence-package-fixtures.js";
import { governedEvidencePackageContext } from "./evidence-package-governed-fixtures.js";

export function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0
      ? ""
      : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

export function repositoryPaths(dir: string) {
  return {
    manifestsPath: join(dir, "manifests.jsonl"),
    claimsPath: join(dir, "claims.jsonl"),
    claimEdgesPath: join(dir, "claim-edges.jsonl"),
    documentRevisionsPath: join(dir, "document-revisions.jsonl"),
    documentDiffsPath: join(dir, "document-diffs.jsonl"),
    evidencePath: join(dir, "evidence.jsonl"),
    evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
    securityEntitiesPath: join(dir, "security-entities.jsonl"),
    securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
  };
}

export function writeGovernedDependencies(dir: string): ReturnType<typeof repositoryPaths> {
  const paths = repositoryPaths(dir);
  const context = governedEvidencePackageContext();
  const evidence = context.evidenceSnapshot.evidence[0];
  const claim = withClaimRecordHash({
    schemaVersion: 1,
    recordId: `${EVIDENCE_PACKAGE_CLAIM_ID}:record:001`,
    claimId: EVIDENCE_PACKAGE_CLAIM_ID,
    entityIds: [EVIDENCE_PACKAGE_ISSUER_ID],
    claimClass: "fact",
    statement: "The disclosed event changes the implementation schedule.",
    status: "active",
    informationCutoff: "2026-08-06T00:02:00+09:00",
    effectiveFrom: "2026-08-06T00:02:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    falsificationConditions: [],
    unknownRefs: [],
    modelVersion: "claim-model-v1",
    ruleVersion: "claim-graph-v1",
  });
  const edge = withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: "claim-edge:evidence-package:support:record:001",
    edgeId: "claim-edge:evidence-package:support",
    fromKind: "evidence",
    fromId: EVIDENCE_PACKAGE_EVIDENCE_ID,
    toKind: "claim",
    toId: EVIDENCE_PACKAGE_CLAIM_ID,
    relationType: "supports",
    strength: "material",
    effectiveFrom: "2026-08-06T00:03:00+09:00",
    observedAt: "2026-08-06T00:03:00+09:00",
    retrievedAt: "2026-08-06T00:04:00+09:00",
    sourceEvidenceIds: [EVIDENCE_PACKAGE_EVIDENCE_ID],
  });

  writeJsonl(paths.securityEntitiesPath, context.securityMasterSnapshot.entities);
  writeJsonl(
    paths.securityRelationshipsPath,
    context.securityMasterSnapshot.relationships,
  );
  writeJsonl(paths.evidencePath, [evidence]);
  writeJsonl(paths.evidenceRelationsPath, context.evidenceSnapshot.relations);
  writeJsonl(paths.claimsPath, [claim]);
  writeJsonl(paths.claimEdgesPath, [edge]);
  writeJsonl(paths.documentRevisionsPath, []);
  writeJsonl(paths.documentDiffsPath, []);
  return paths;
}
