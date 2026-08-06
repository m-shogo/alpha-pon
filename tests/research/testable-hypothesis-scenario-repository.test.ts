import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withClaimGraphEdgeHash,
} from "../../src/research/claim-contradiction-graph.js";
import {
  buildHypothesisScenarioSetGoverned,
} from "../../src/research/testable-hypothesis-scenario-hardening.js";
import {
  validateHypothesisScenarioRepository,
} from "../../src/research/testable-hypothesis-scenario-repository.js";
import {
  EVIDENCE_PACKAGE_EVIDENCE_ID,
} from "./evidence-package-fixtures.js";
import {
  governedEvidencePackageResolver,
} from "./evidence-package-governed-fixtures.js";
import {
  completeHypothesisEvidencePackage,
  hypothesisClaimRecords,
  hypothesisEvidencePackageContext,
  registeredScenarioSetRecords,
  testableHypothesis,
} from "./testable-hypothesis-scenario-fixtures.js";

function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0
      ? ""
      : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

function pathsFor(dir: string) {
  return {
    hypothesesPath: join(dir, "hypotheses.jsonl"),
    scenariosPath: join(dir, "scenarios.jsonl"),
    scenarioSetsPath: join(dir, "scenario-sets.jsonl"),
    claimsPath: join(dir, "claims.jsonl"),
    claimEdgesPath: join(dir, "claim-edges.jsonl"),
    evidencePackagesPath: join(dir, "evidence-packages.jsonl"),
    documentRevisionsPath: join(dir, "document-revisions.jsonl"),
    documentDiffsPath: join(dir, "document-diffs.jsonl"),
    evidencePath: join(dir, "evidence.jsonl"),
    evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
    securityEntitiesPath: join(dir, "security-entities.jsonl"),
    securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
  };
}

{
  const dir = mkdtempSync(join(tmpdir(), "hypothesis-scenario-repository-empty-"));
  try {
    const result = validateHypothesisScenarioRepository(pathsFor(dir));
    assert.equal(result.issues.some((item) => item.severity === "error"), false);
    assert.equal(result.hypothesisCount, 0);
    assert.equal(result.registeredScenarioSetHeadCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("testable-hypothesis-scenario-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "hypothesis-scenario-repository-pilot-"));
  const paths = pathsFor(dir);
  try {
    const context = hypothesisEvidencePackageContext();
    const claims = hypothesisClaimRecords();
    const edges = claims.map((record, index) => withClaimGraphEdgeHash({
      schemaVersion: 1,
      recordId: `claim-edge:hypothesis-fixture:support:${index}:record:001`,
      edgeId: `claim-edge:hypothesis-fixture:support:${index}`,
      fromKind: "evidence",
      fromId: EVIDENCE_PACKAGE_EVIDENCE_ID,
      toKind: "claim",
      toId: record.claimId,
      relationType: "supports",
      strength: "material",
      effectiveFrom: "2026-08-06T00:03:00+09:00",
      observedAt: "2026-08-06T00:03:00+09:00",
      retrievedAt: "2026-08-06T00:04:00+09:00",
      sourceEvidenceIds: [EVIDENCE_PACKAGE_EVIDENCE_ID],
    }));
    const packageManifest = completeHypothesisEvidencePackage();
    const hypothesis = testableHypothesis();
    const scenarios = registeredScenarioSetRecords();
    const scenarioSet = buildHypothesisScenarioSetGoverned(
      {
        scenarioSetId: "scenario-set:repository:001",
        createdAt: "2026-08-06T00:39:00+09:00",
        registeredAt: "2026-08-06T00:40:00+09:00",
      },
      hypothesis,
      packageManifest,
      scenarios,
    );

    writeJsonl(paths.securityEntitiesPath, context.securityMasterSnapshot.entities);
    writeJsonl(
      paths.securityRelationshipsPath,
      context.securityMasterSnapshot.relationships,
    );
    writeJsonl(paths.evidencePath, context.evidenceSnapshot.evidence);
    writeJsonl(paths.evidenceRelationsPath, context.evidenceSnapshot.relations);
    writeJsonl(paths.claimsPath, claims);
    writeJsonl(paths.claimEdgesPath, edges);
    writeJsonl(paths.documentRevisionsPath, []);
    writeJsonl(paths.documentDiffsPath, []);
    writeJsonl(paths.evidencePackagesPath, [packageManifest]);
    writeJsonl(paths.hypothesesPath, [hypothesis]);
    writeJsonl(paths.scenariosPath, scenarios);
    writeJsonl(paths.scenarioSetsPath, [scenarioSet]);

    const result = validateHypothesisScenarioRepository({
      ...paths,
      externalPins: governedEvidencePackageResolver(),
    });
    assert.deepEqual(
      result.issues.filter((item) => item.severity === "error"),
      [],
    );
    assert.equal(result.hypothesisCount, 1);
    assert.equal(result.registeredHypothesisHeadCount, 1);
    assert.equal(result.scenarioCount, 4);
    assert.equal(result.registeredScenarioHeadCount, 4);
    assert.equal(result.scenarioSetCount, 1);
    assert.equal(result.registeredScenarioSetHeadCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("testable-hypothesis-scenario-repository: registered file-backed pilot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "hypothesis-scenario-repository-partial-"));
  const paths = pathsFor(dir);
  try {
    writeFileSync(paths.hypothesesPath, '{"partial":true}', "utf-8");
    const result = validateHypothesisScenarioRepository(paths);
    assert.ok(result.issues.some((item) =>
      item.code === "partial_hypothesis_scenario_tail",
    ));
    assert.equal(result.hypothesisCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("testable-hypothesis-scenario-repository: partial tail block OK");
}

console.log("testable-hypothesis-scenario-repository: 全テスト成功");
