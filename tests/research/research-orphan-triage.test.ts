import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH,
  RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH,
  buildResearchOrphanTriageView,
  readResearchOrphanTriageLedger,
  type ResearchOrphanTriageClassification,
} from "../../src/research/research-orphan-triage.js";
import type {
  ResearchOrphanCandidate,
  ResearchOrphanDiscoveryResult,
} from "../../src/research/research-orphan-discovery.js";

const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

function withTempRepository(
  run: (root: string) => void,
  options: { schema?: boolean } = {},
): void {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-triage-"));
  try {
    if (options.schema !== false) {
      const schemaTarget = join(root, RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH);
      mkdirSync(join(schemaTarget, ".."), { recursive: true });
      writeFileSync(schemaTarget, readFileSync(RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH, "utf-8"), "utf-8");
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeLedger(root: string, rows: readonly unknown[], endingNewline = true): void {
  const target = join(root, RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH);
  mkdirSync(join(target, ".."), { recursive: true });
  const content = rows.map((row) => typeof row === "string" ? row : JSON.stringify(row)).join("\n");
  writeFileSync(target, `${content}${endingNewline ? "\n" : ""}`, "utf-8");
}

function decision(
  decisionId: string,
  candidateKey: string,
  classification: ResearchOrphanTriageClassification,
  reviewedAt: string,
  fingerprint = FP_A,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    decisionId,
    candidateKey,
    candidateFingerprint: fingerprint,
    classification,
    decisionSource: "human_review",
    reviewedAt,
    rationale: "Reviewed deliberately by a human and retained as audit memory.",
  };
}

function candidate(key: string, fingerprint = FP_A): ResearchOrphanCandidate {
  return {
    key,
    fingerprint,
    kind: "unregistered_asset",
    discoveryStage: "structured_scan",
    classification: "unclassified",
    assetType: "document",
    path: `docs/research/${key.replace(/[^a-z0-9]+/gi, "-")}.md`,
    reason: "test orphan",
  };
}

function discovery(candidates: readonly ResearchOrphanCandidate[]): ResearchOrphanDiscoveryResult {
  return {
    candidates,
    scannedDocumentPaths: candidates.map((entry) => entry.path),
    issues: [],
    stats: {
      scannedDocumentCount: candidates.length,
      unregisteredDocumentCount: candidates.length,
      unlinkedProvenAssetCount: 0,
      totalCandidates: candidates.length,
    },
  };
}

withTempRepository((root) => {
  const ledger = readResearchOrphanTriageLedger(root);
  assert.deepEqual(ledger.issues, []);
  assert.deepEqual(ledger.records, [], "missing ledger is a valid empty human-review history");
});

withTempRepository((root) => {
  const ledger = readResearchOrphanTriageLedger(root);
  assert.ok(ledger.issues.some((entry) => entry.code === "research_orphan_triage_schema_unreadable"));
  assert.deepEqual(ledger.records, [], "missing schema must fail closed even before the first decision exists");
}, { schema: false });

withTempRepository((root) => {
  const key = "unregistered_asset:document:docs/research/architecture.md";
  writeLedger(root, [decision("decision-infra", key, "infrastructure", "2026-08-28T07:30:00Z")]);
  const ledger = readResearchOrphanTriageLedger(root);
  const view = buildResearchOrphanTriageView(discovery([candidate(key)]), ledger);
  assert.equal(view.stats.reviewedCurrentCount, 1);
  assert.equal(view.stats.acknowledgedCount, 1);
  assert.equal(view.stats.actionableCount, 0);
  assert.equal(view.reviewQueue.length, 0, "current infrastructure review can be quiet without deleting history");
});

withTempRepository((root) => {
  const key = "unregistered_asset:document:docs/research/changing.md";
  writeLedger(root, [decision("decision-stale", key, "not_research", "2026-08-28T07:31:00Z", FP_A)]);
  const view = buildResearchOrphanTriageView(
    discovery([candidate(key, FP_B)]),
    readResearchOrphanTriageLedger(root),
  );
  assert.equal(view.stats.staleReviewCount, 1);
  assert.equal(view.reviewQueue[0]?.triageState, "review_stale", "content/context changes must reopen human review");
  assert.equal(view.stats.acknowledgedCount, 0, "stale not_research must not remain silently acknowledged");
});

withTempRepository((root) => {
  const itemKey = "unregistered_asset:document:docs/research/early-idea.md";
  const studyKey = "unregistered_asset:document:docs/research/sample-analysis.md";
  writeLedger(root, [
    decision("decision-item", itemKey, "research_item_candidate", "2026-08-28T07:32:00Z"),
    decision("decision-study", studyKey, "study_candidate", "2026-08-28T07:33:00Z"),
  ]);
  const view = buildResearchOrphanTriageView(
    discovery([candidate(itemKey), candidate(studyKey)]),
    readResearchOrphanTriageLedger(root),
  );
  assert.equal(view.stats.actionableCount, 2, "classification is not resolution; research/study candidates stay visible");
  assert.equal(view.reviewQueue.length, 0, "reviewed actionable items leave review queue but remain actionable");
});

withTempRepository((root) => {
  const key = "unregistered_asset:document:docs/research/ai.md";
  const valid = decision("decision-human", key, "infrastructure", "2026-08-28T07:34:00Z");
  const invalid = { ...decision("decision-ai-source", key, "not_research", "2026-08-28T07:35:00Z"), decisionSource: "ai" };
  const target = join(root, RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(valid)}\n\n${JSON.stringify(invalid)}\n`, "utf-8");
  const ledger = readResearchOrphanTriageLedger(root);
  assert.ok(ledger.issues.some((entry) => entry.code === "research_orphan_triage_schema_invalid" && entry.target.endsWith(":3")), "physical JSONL line number must survive blank lines");
  assert.deepEqual(ledger.records, [], "AI-authored canonical decisions fail the entire ledger closed");
});

withTempRepository((root) => {
  const firstKey = "unregistered_asset:document:docs/research/one.md";
  const secondKey = "unregistered_asset:document:docs/research/two.md";
  writeLedger(root, [
    decision("decision-duplicate", firstKey, "infrastructure", "2026-08-28T07:36:00Z"),
    decision("decision-duplicate", secondKey, "not_research", "2026-08-28T07:37:00Z"),
  ]);
  const ledger = readResearchOrphanTriageLedger(root);
  assert.ok(ledger.issues.some((entry) => entry.code === "research_orphan_triage_duplicate_decision_id"));
  assert.deepEqual(ledger.latestByCandidateKey, {}, "duplicate audit identity must fail closed");
});

withTempRepository((root) => {
  const key = "unregistered_asset:document:docs/research/time.md";
  writeLedger(root, [
    decision("decision-time-one", key, "infrastructure", "2026-08-28T07:40:00Z"),
    decision("decision-time-two", key, "not_research", "2026-08-28T07:39:00Z"),
  ]);
  const ledger = readResearchOrphanTriageLedger(root);
  assert.ok(ledger.issues.some((entry) => entry.code === "research_orphan_triage_review_time_not_increasing"));
});

withTempRepository((root) => {
  const key = "unregistered_asset:document:docs/research/partial.md";
  writeLedger(root, [decision("decision-partial", key, "infrastructure", "2026-08-28T07:41:00Z")], false);
  const ledger = readResearchOrphanTriageLedger(root);
  assert.ok(ledger.issues.some((entry) => entry.code === "research_orphan_triage_partial_tail"));
  assert.deepEqual(ledger.records, [], "possible torn append must never produce a partial authority view");
});

withTempRepository((root) => {
  const key = "unregistered_asset:document:docs/research/history.md";
  writeLedger(root, [
    decision("decision-history-one", key, "research_item_candidate", "2026-08-28T07:42:00Z"),
    decision("decision-history-two", key, "infrastructure", "2026-08-28T07:43:00Z"),
  ]);
  const ledger = readResearchOrphanTriageLedger(root);
  assert.deepEqual(ledger.issues, []);
  assert.equal(ledger.latestByCandidateKey[key]?.decisionId, "decision-history-two", "later human review supersedes only the projection, never history");
  assert.equal(ledger.records.length, 2, "append-only prior decisions remain auditable");

  const view = buildResearchOrphanTriageView(discovery([]), ledger);
  assert.equal(view.stats.historicalOnlyDecisionCount, 1, "resolved/disappeared candidates retain historical review memory");
  assert.equal(view.historicalOnlyDecisions[0]?.decisionId, "decision-history-two");
});

console.log("research/orphan-triage: append-only human review memory + stale reopening OK");
