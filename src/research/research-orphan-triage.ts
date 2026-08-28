import { existsSync } from "node:fs";
import { join } from "node:path";
import { readReadOnlyJsonObjectFile } from "../read-only-json-file.js";
import { readReadOnlyTextFile } from "../read-only-text-file.js";
import { compareExplicitIso8601Instants } from "./iso-instant.js";
import { formatErrors, validate, type JsonSchema } from "./schema.js";
import type { ResearchKnowledgeIssue } from "./research-knowledge-semantics.js";
import type { ResearchOrphanCandidate, ResearchOrphanDiscoveryResult } from "./research-orphan-discovery.js";

export const RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH = "research/orphan_triage/decisions.jsonl";
export const RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH = "research/schemas/research-orphan-triage.schema.json";

export type ResearchOrphanTriageClassification =
  | "existing_research_link_missing"
  | "research_item_candidate"
  | "component_candidate"
  | "study_candidate"
  | "new_edge_candidate"
  | "case_candidate"
  | "infrastructure"
  | "duplicate_candidate"
  | "not_research";

export type ResearchOrphanTriageDecision = {
  schemaVersion: 1;
  decisionId: string;
  candidateKey: string;
  candidateFingerprint: string;
  classification: ResearchOrphanTriageClassification;
  decisionSource: "human_review";
  reviewedAt: string;
  rationale: string;
};

export interface ResearchOrphanTriageLedgerResult {
  records: readonly ResearchOrphanTriageDecision[];
  latestByCandidateKey: Readonly<Record<string, ResearchOrphanTriageDecision>>;
  issues: readonly ResearchKnowledgeIssue[];
}

export interface ResearchOrphanTriageCandidateView {
  candidate: ResearchOrphanCandidate;
  decision?: ResearchOrphanTriageDecision;
  triageState: "unreviewed" | "reviewed_current" | "review_stale";
}

export interface ResearchOrphanTriageView {
  candidates: readonly ResearchOrphanTriageCandidateView[];
  reviewQueue: readonly ResearchOrphanTriageCandidateView[];
  actionable: readonly ResearchOrphanTriageCandidateView[];
  acknowledged: readonly ResearchOrphanTriageCandidateView[];
  historicalOnlyDecisions: readonly ResearchOrphanTriageDecision[];
  issues: readonly ResearchKnowledgeIssue[];
  stats: {
    rawCandidateCount: number;
    unreviewedCount: number;
    staleReviewCount: number;
    reviewedCurrentCount: number;
    actionableCount: number;
    acknowledgedCount: number;
    historicalOnlyDecisionCount: number;
  };
}

const ACTIONABLE_CLASSIFICATIONS = new Set<ResearchOrphanTriageClassification>([
  "existing_research_link_missing",
  "research_item_candidate",
  "component_candidate",
  "study_candidate",
  "new_edge_candidate",
  "case_candidate",
  "duplicate_candidate",
]);

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

function loadTriageSchema(repositoryRootPath: string): { schema?: JsonSchema; issues: ResearchKnowledgeIssue[] } {
  const absolutePath = join(repositoryRootPath, RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH);
  const loaded = readReadOnlyJsonObjectFile<JsonSchema>(absolutePath);
  if (loaded.missing || loaded.parseError || loaded.invalidRoot || !loaded.object) {
    return {
      issues: [issue(
        "research_orphan_triage_schema_unreadable",
        RESEARCH_ORPHAN_TRIAGE_SCHEMA_PATH,
        "triage decision schema must be a standalone regular JSON object file",
      )],
    };
  }
  return { schema: loaded.object, issues: [] };
}

type ParsedRow = { value: unknown; line: number };

function parseJsonl(text: string, target: string): { rows: ParsedRow[]; issues: ResearchKnowledgeIssue[] } {
  const rows: ParsedRow[] = [];
  const issues: ResearchKnowledgeIssue[] = [];
  for (const [index, rawLine] of text.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      rows.push({ value: JSON.parse(line) as unknown, line: index + 1 });
    } catch {
      issues.push(issue(
        "research_orphan_triage_jsonl_parse_error",
        `${target}:${index + 1}`,
        "triage ledger row is not valid JSON",
      ));
    }
  }
  return { rows, issues };
}

export function readResearchOrphanTriageLedger(
  repositoryRootPath = ".",
  asOf = new Date().toISOString(),
): ResearchOrphanTriageLedgerResult {
  const schemaResult = loadTriageSchema(repositoryRootPath);
  if (!schemaResult.schema) {
    return { records: [], latestByCandidateKey: {}, issues: sortIssues(schemaResult.issues) };
  }

  const absoluteLedgerPath = join(repositoryRootPath, RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH);
  if (!existsSync(absoluteLedgerPath)) {
    return { records: [], latestByCandidateKey: {}, issues: [] };
  }

  const text = readReadOnlyTextFile(absoluteLedgerPath);
  if (!text) {
    return {
      records: [],
      latestByCandidateKey: {},
      issues: [issue(
        "research_orphan_triage_ledger_unreadable",
        RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH,
        "existing triage ledger must be a non-empty standalone regular text file",
      )],
    };
  }
  if (!text.endsWith("\n")) {
    return {
      records: [],
      latestByCandidateKey: {},
      issues: [issue(
        "research_orphan_triage_partial_tail",
        RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH,
        "triage decision JSONL must end with a newline; partial append is possible",
      )],
    };
  }

  const parsed = parseJsonl(text, RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH);
  const issues = [...parsed.issues];
  const records: ResearchOrphanTriageDecision[] = [];

  for (const row of parsed.rows) {
    const errors = validate(row.value, schemaResult.schema);
    if (errors.length > 0) {
      issues.push(issue(
        "research_orphan_triage_schema_invalid",
        `${RESEARCH_ORPHAN_TRIAGE_LEDGER_PATH}:${row.line}`,
        formatErrors(errors),
      ));
      continue;
    }
    records.push(row.value as ResearchOrphanTriageDecision);
  }

  const decisionIds = new Set<string>();
  const latestByCandidateKey: Record<string, ResearchOrphanTriageDecision> = {};
  for (const record of records) {
    if (decisionIds.has(record.decisionId)) {
      issues.push(issue(
        "research_orphan_triage_duplicate_decision_id",
        record.decisionId,
        "decisionId must be globally unique in the append-only triage ledger",
      ));
    }
    decisionIds.add(record.decisionId);

    try {
      if (compareExplicitIso8601Instants(
        record.reviewedAt,
        asOf,
        `${record.decisionId}.reviewedAt`,
        "research_orphan_triage.asOf",
      ) > 0) {
        issues.push(issue(
          "research_orphan_triage_review_time_in_future",
          record.decisionId,
          `reviewedAt must not be later than the read boundary ${asOf}`,
        ));
      }
    } catch (error) {
      issues.push(issue(
        "research_orphan_triage_review_time_invalid",
        record.decisionId,
        error instanceof Error ? error.message : String(error),
      ));
    }

    const previous = latestByCandidateKey[record.candidateKey];
    if (previous) {
      try {
        if (compareExplicitIso8601Instants(
          record.reviewedAt,
          previous.reviewedAt,
          `${record.decisionId}.reviewedAt`,
          `${previous.decisionId}.reviewedAt`,
        ) <= 0) {
          issues.push(issue(
            "research_orphan_triage_review_time_not_increasing",
            record.candidateKey,
            `later ledger decisions must have reviewedAt after ${previous.reviewedAt}`,
          ));
        }
      } catch (error) {
        issues.push(issue(
          "research_orphan_triage_review_time_invalid",
          record.decisionId,
          error instanceof Error ? error.message : String(error),
        ));
      }
    }
    latestByCandidateKey[record.candidateKey] = record;
  }

  if (issues.length > 0) {
    return { records: [], latestByCandidateKey: {}, issues: sortIssues(issues) };
  }

  return { records, latestByCandidateKey, issues: [] };
}

function isActionable(decision: ResearchOrphanTriageDecision): boolean {
  return ACTIONABLE_CLASSIFICATIONS.has(decision.classification);
}

function emptyView(issues: readonly ResearchKnowledgeIssue[]): ResearchOrphanTriageView {
  return {
    candidates: [],
    reviewQueue: [],
    actionable: [],
    acknowledged: [],
    historicalOnlyDecisions: [],
    issues: sortIssues(issues),
    stats: {
      rawCandidateCount: 0,
      unreviewedCount: 0,
      staleReviewCount: 0,
      reviewedCurrentCount: 0,
      actionableCount: 0,
      acknowledgedCount: 0,
      historicalOnlyDecisionCount: 0,
    },
  };
}

export function buildResearchOrphanTriageView(
  discovery: ResearchOrphanDiscoveryResult,
  ledger: ResearchOrphanTriageLedgerResult,
): ResearchOrphanTriageView {
  const upstreamIssues = [...discovery.issues, ...ledger.issues];
  if (upstreamIssues.length > 0) return emptyView(upstreamIssues);

  const candidates: ResearchOrphanTriageCandidateView[] = discovery.candidates.map((candidate) => {
    const decision = ledger.latestByCandidateKey[candidate.key];
    if (!decision) return { candidate, triageState: "unreviewed" };
    if (decision.candidateFingerprint !== candidate.fingerprint) {
      return { candidate, decision, triageState: "review_stale" };
    }
    return { candidate, decision, triageState: "reviewed_current" };
  });

  const reviewQueue = candidates.filter((entry) => entry.triageState !== "reviewed_current");
  const current = candidates.filter((entry) => entry.triageState === "reviewed_current" && entry.decision);
  const actionable = current.filter((entry) => isActionable(entry.decision!));
  const acknowledged = current.filter((entry) => !isActionable(entry.decision!));
  const currentKeys = new Set(discovery.candidates.map((candidate) => candidate.key));
  const historicalOnlyDecisions = Object.values(ledger.latestByCandidateKey)
    .filter((decision) => !currentKeys.has(decision.candidateKey))
    .sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));

  return {
    candidates,
    reviewQueue,
    actionable,
    acknowledged,
    historicalOnlyDecisions,
    issues: [],
    stats: {
      rawCandidateCount: candidates.length,
      unreviewedCount: candidates.filter((entry) => entry.triageState === "unreviewed").length,
      staleReviewCount: candidates.filter((entry) => entry.triageState === "review_stale").length,
      reviewedCurrentCount: current.length,
      actionableCount: actionable.length,
      acknowledgedCount: acknowledged.length,
      historicalOnlyDecisionCount: historicalOnlyDecisions.length,
    },
  };
}
