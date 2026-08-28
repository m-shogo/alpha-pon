import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH,
  RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH,
  readResearchOrphanTriageLedger,
} from "../../src/research/research-orphan-triage.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-triage-future-"));
try {
  const schemaTarget = join(root, RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH);
  mkdirSync(join(schemaTarget, ".."), { recursive: true });
  writeFileSync(schemaTarget, readFileSync(RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH, "utf-8"), "utf-8");

  const ledgerTarget = join(root, RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH);
  mkdirSync(join(ledgerTarget, ".."), { recursive: true });
  writeFileSync(ledgerTarget, `${JSON.stringify({
    schemaVersion: 1,
    decisionId: "decision-future-review",
    candidateKey: "unregistered_asset:document:docs/research/future.md",
    candidateFingerprint: "a".repeat(64),
    classification: "not_research",
    decisionSource: "human_review",
    reviewedAt: "2026-08-28T08:01:00Z",
    rationale: "Reviewed deliberately by a human.",
  })}\n`, "utf-8");

  const ledger = readResearchOrphanTriageLedger(root, "2026-08-28T08:00:00Z");
  assert.ok(
    ledger.issues.some((entry) => entry.code === "research_orphan_triage_review_time_in_future"),
    "future human-review timestamps must fail closed at the read boundary",
  );
  assert.deepEqual(ledger.records, [], "future review must not become current canonical triage memory");
  assert.deepEqual(ledger.latestByCandidateKey, {});
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("research/orphan-triage: future review boundary fails closed OK");
