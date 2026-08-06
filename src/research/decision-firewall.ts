import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  computeReplayResultHash,
  type CouncilReplayManifest,
  type CouncilReplayResult,
} from "./stock-pro-council-replay.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";
import type { CouncilIssue } from "./stock-pro-council-v2-validation.js";

export type UnknownBudgetCategory =
  | "entity"
  | "time"
  | "license"
  | "source"
  | "evidence_gap"
  | "execution"
  | "confounder"
  | "counterfactual"
  | "valuation"
  | "liquidity"
  | "portfolio_exposure";

export type UnknownBudgetEntry = {
  category: UnknownBudgetCategory;
  status: "known" | "unknown" | "resolved";
  severity: "informational" | "blocking";
  summary: string;
  evidenceRefs: string[];
};

export type EvidenceReadiness = {
  normalizedEvidence: boolean;
  claimGraph: boolean;
  falsifiableHypothesis: boolean;
  primarySources: boolean;
  contradictionsReviewed: boolean;
  correctionChainComplete: boolean;
  benchmarkComplete: boolean;
  executionRouteComplete: boolean;
  scenarioAssumptionsReproducible: boolean;
};

export type PortfolioSuitabilityStatus = "not_assessed" | "eligible" | "wait" | "avoid";

export type DecisionFirewallRecord = {
  schemaVersion: 1;
  firewallId: string;
  candidateId: string;
  replayId: string;
  councilRunId: string;
  createdAt: string;
  informationCutoff: string;
  replayManifestHash: string;
  replayResultHash: string;
  evidencePackageHash: string;
  priceSnapshotHash: string;
  securityMasterVersion: string;
  evidenceStoreVersion: string;
  marketCalendarVersion: string;
  ruleVersion: string;
  evidenceReadiness: EvidenceReadiness;
  unknownBudget: UnknownBudgetEntry[];
  bindingVetoIds: string[];
  stockRecommendationCandidateEligible: boolean;
  personalRecommendationCandidateEligible: boolean;
  portfolioSuitabilityStatus: PortfolioSuitabilityStatus;
  blockers: string[];
  supersedesFirewallId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type DecisionFirewallAssessmentInput = Omit<
  DecisionFirewallRecord,
  | "replayId"
  | "councilRunId"
  | "informationCutoff"
  | "replayManifestHash"
  | "replayResultHash"
  | "evidencePackageHash"
  | "priceSnapshotHash"
  | "bindingVetoIds"
  | "stockRecommendationCandidateEligible"
  | "personalRecommendationCandidateEligible"
  | "blockers"
  | "contentHash"
>;

export const DECISION_FIREWALL_PATHS = {
  records: "research/decision_firewall/records.jsonl",
  schema: "research/schemas/decision-firewall-record.schema.json",
} as const;

export const REQUIRED_UNKNOWN_BUDGET_CATEGORIES: readonly UnknownBudgetCategory[] = [
  "entity",
  "time",
  "license",
  "source",
  "evidence_gap",
  "execution",
  "confounder",
  "counterfactual",
  "valuation",
  "liquidity",
  "portfolio_exposure",
];

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutHash(record: DecisionFirewallRecord): Omit<DecisionFirewallRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeDecisionFirewallHash(
  record: DecisionFirewallRecord | Omit<DecisionFirewallRecord, "contentHash">,
): string {
  return hashValue("contentHash" in record ? withoutHash(record) : record);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function equalSets(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function issue(code: string, target: string, message: string): CouncilIssue {
  return { severity: "error", code, target, message };
}

function sortIssues(issues: CouncilIssue[]): CouncilIssue[] {
  return [...issues].sort((a, b) =>
    `${a.severity}|${a.code}|${a.target}|${a.message}`.localeCompare(
      `${b.severity}|${b.code}|${b.target}|${b.message}`,
    ),
  );
}

function schemaIssues(value: unknown, schema: JsonSchema, target: string): CouncilIssue[] {
  return validate(value, schema).map((error) => ({
    severity: "error",
    code: "schema_violation",
    target: error.path ? `${target}:${error.path}` : target,
    message: error.message,
  }));
}

function evidenceBlockers(readiness: EvidenceReadiness): string[] {
  return Object.entries(readiness)
    .filter(([, ready]) => !ready)
    .map(([key]) => `evidence_not_ready:${key}`)
    .sort();
}

function unknownBudgetBlockers(
  entries: UnknownBudgetEntry[],
  includePortfolio: boolean,
): string[] {
  return entries
    .filter((entry) =>
      entry.status === "unknown" &&
      entry.severity === "blocking" &&
      (includePortfolio || entry.category !== "portfolio_exposure"),
    )
    .map((entry) => `unknown_blocking:${entry.category}`)
    .sort();
}

function stockBlockers(
  manifest: CouncilReplayManifest,
  result: CouncilReplayResult,
  readiness: EvidenceReadiness,
  unknownBudget: UnknownBudgetEntry[],
): string[] {
  return sortedUnique([
    ...(result.eligibleForRecommendationCandidate
      ? []
      : result.blockers.map((blocker) => `replay:${blocker}`)),
    ...result.bindingVetoIds.map((vetoId) => `binding_veto:${vetoId}`),
    ...evidenceBlockers(readiness),
    ...unknownBudgetBlockers(unknownBudget, false),
    ...(manifest.evidencePackageHash ? [] : ["missing_evidence_package_hash"]),
    ...(manifest.priceSnapshotHash ? [] : ["missing_price_snapshot_hash"]),
  ]);
}

function personalOnlyBlockers(
  unknownBudget: UnknownBudgetEntry[],
  portfolioStatus: PortfolioSuitabilityStatus,
): string[] {
  return sortedUnique([
    ...unknownBudgetBlockers(unknownBudget, true)
      .filter((blocker) => blocker.endsWith(":portfolio_exposure")),
    ...(portfolioStatus === "eligible"
      ? []
      : [`portfolio_suitability:${portfolioStatus}`]),
  ]);
}

export function buildDecisionFirewallRecord(
  input: DecisionFirewallAssessmentInput,
  manifest: CouncilReplayManifest,
  replayResult: CouncilReplayResult,
): DecisionFirewallRecord {
  const stock = stockBlockers(
    manifest,
    replayResult,
    input.evidenceReadiness,
    input.unknownBudget,
  );
  const personal = personalOnlyBlockers(
    input.unknownBudget,
    input.portfolioSuitabilityStatus,
  );
  const recordWithoutHash: Omit<DecisionFirewallRecord, "contentHash"> = {
    schemaVersion: 1,
    firewallId: input.firewallId,
    candidateId: input.candidateId,
    replayId: manifest.replayId,
    councilRunId: manifest.councilRunId,
    createdAt: input.createdAt,
    informationCutoff: manifest.informationCutoff,
    replayManifestHash: manifest.contentHash,
    replayResultHash: replayResult.resultHash,
    evidencePackageHash: manifest.evidencePackageHash,
    priceSnapshotHash: manifest.priceSnapshotHash,
    securityMasterVersion: input.securityMasterVersion,
    evidenceStoreVersion: input.evidenceStoreVersion,
    marketCalendarVersion: input.marketCalendarVersion,
    ruleVersion: input.ruleVersion,
    evidenceReadiness: input.evidenceReadiness,
    unknownBudget: [...input.unknownBudget]
      .map((entry) => ({ ...entry, evidenceRefs: sortedUnique(entry.evidenceRefs) }))
      .sort((a, b) => a.category.localeCompare(b.category)),
    bindingVetoIds: sortedUnique(replayResult.bindingVetoIds),
    stockRecommendationCandidateEligible: stock.length === 0,
    personalRecommendationCandidateEligible: stock.length === 0 && personal.length === 0,
    portfolioSuitabilityStatus: input.portfolioSuitabilityStatus,
    blockers: sortedUnique([...stock, ...personal]),
    ...(input.supersedesFirewallId
      ? { supersedesFirewallId: input.supersedesFirewallId }
      : {}),
    automaticTradingAuthorized: false,
  };
  return {
    ...recordWithoutHash,
    contentHash: computeDecisionFirewallHash(recordWithoutHash),
  };
}

function validateUnknownBudget(
  entries: UnknownBudgetEntry[],
  target: string,
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const categories = entries.map((entry) => entry.category);
  if (!equalSets(categories, REQUIRED_UNKNOWN_BUDGET_CATEGORIES)) {
    issues.push(issue(
      "unknown_budget_category_mismatch",
      target,
      `required=${REQUIRED_UNKNOWN_BUDGET_CATEGORIES.join(",")} actual=${sortedUnique(categories).join(",")}`,
    ));
  }
  if (new Set(categories).size !== categories.length) {
    issues.push(issue(
      "duplicate_unknown_budget_category",
      target,
      "unknown budget categoryが重複しています",
    ));
  }
  for (const entry of entries) {
    if (
      (entry.status === "known" || entry.status === "resolved") &&
      entry.evidenceRefs.length === 0
    ) {
      issues.push(issue(
        "known_unknown_budget_without_evidence",
        `${target}.${entry.category}`,
        `${entry.status}にはevidenceRefsが必要です`,
      ));
    }
    if (entry.status === "known" && entry.severity === "blocking") {
      issues.push(issue(
        "known_unknown_budget_still_blocking",
        `${target}.${entry.category}`,
        "status=knownをblockingとして保持できません",
      ));
    }
  }
  return issues;
}

export function validateDecisionFirewallRecord(
  record: DecisionFirewallRecord,
  schema: JsonSchema,
  manifest: CouncilReplayManifest,
  replayResult: CouncilReplayResult,
  target = "DecisionFirewallRecord",
): CouncilIssue[] {
  const issues = schemaIssues(record, schema, target);
  if (issues.length > 0) return sortIssues(issues);

  if (record.contentHash !== computeDecisionFirewallHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (Date.parse(record.createdAt) < Date.parse(record.informationCutoff)) {
    issues.push(issue(
      "firewall_created_before_cutoff",
      `${target}.createdAt`,
      "createdAtはinformationCutoff以後である必要があります",
    ));
  }
  if (
    record.replayId !== manifest.replayId ||
    record.councilRunId !== manifest.councilRunId ||
    record.informationCutoff !== manifest.informationCutoff
  ) {
    issues.push(issue(
      "firewall_replay_identity_mismatch",
      target,
      "replayId/councilRunId/informationCutoffがmanifestと一致しません",
    ));
  }
  if (
    record.replayManifestHash !== manifest.contentHash ||
    record.replayResultHash !== replayResult.resultHash ||
    record.evidencePackageHash !== manifest.evidencePackageHash ||
    record.priceSnapshotHash !== manifest.priceSnapshotHash
  ) {
    issues.push(issue(
      "firewall_snapshot_hash_mismatch",
      target,
      "Replay/Evidence/Price snapshot hashが入力と一致しません",
    ));
  }
  if (
    replayResult.replayId !== manifest.replayId ||
    replayResult.councilRunId !== manifest.councilRunId ||
    replayResult.informationCutoff !== manifest.informationCutoff ||
    replayResult.manifestHash !== manifest.contentHash ||
    replayResult.resultHash !== computeReplayResultHash(replayResult)
  ) {
    issues.push(issue(
      "invalid_replay_result_for_firewall",
      target,
      "Replay Resultがmanifestまたはdeterministic hashと一致しません",
    ));
  }
  if (!equalSets(record.bindingVetoIds, replayResult.bindingVetoIds)) {
    issues.push(issue(
      "binding_veto_set_mismatch",
      `${target}.bindingVetoIds`,
      "binding veto集合がReplay Resultと一致しません",
    ));
  }
  issues.push(...validateUnknownBudget(record.unknownBudget, `${target}.unknownBudget`));

  const expectedStock = stockBlockers(
    manifest,
    replayResult,
    record.evidenceReadiness,
    record.unknownBudget,
  );
  const expectedPersonal = personalOnlyBlockers(
    record.unknownBudget,
    record.portfolioSuitabilityStatus,
  );
  const expectedBlockers = sortedUnique([...expectedStock, ...expectedPersonal]);
  if (!equalSets(record.blockers, expectedBlockers)) {
    issues.push(issue(
      "firewall_blocker_set_mismatch",
      `${target}.blockers`,
      `expected=${expectedBlockers.join(",")} actual=${sortedUnique(record.blockers).join(",")}`,
    ));
  }
  if (record.stockRecommendationCandidateEligible !== (expectedStock.length === 0)) {
    issues.push(issue(
      "stock_eligibility_mismatch",
      `${target}.stockRecommendationCandidateEligible`,
      "stock eligibilityがblockerから再計算した結果と一致しません",
    ));
  }
  if (
    record.personalRecommendationCandidateEligible !==
    (expectedStock.length === 0 && expectedPersonal.length === 0)
  ) {
    issues.push(issue(
      "personal_eligibility_mismatch",
      `${target}.personalRecommendationCandidateEligible`,
      "personal eligibilityがblockerから再計算した結果と一致しません",
    ));
  }
  if (
    record.personalRecommendationCandidateEligible &&
    !record.stockRecommendationCandidateEligible
  ) {
    issues.push(issue(
      "personal_eligible_without_stock_eligibility",
      target,
      "stock candidateがblock中にpersonal candidateへ進めません",
    ));
  }
  return sortIssues(issues);
}

function duplicateIssues(values: string[], code: string, target: string): CouncilIssue[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => issue(code, target, value));
}

export function validateDecisionFirewallLedger(
  records: DecisionFirewallRecord[],
  schema: JsonSchema,
  manifests: Map<string, CouncilReplayManifest>,
  replayResults: Map<string, CouncilReplayResult>,
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  for (const [index, record] of records.entries()) {
    const manifest = manifests.get(record.replayManifestHash);
    const result = replayResults.get(record.replayResultHash);
    if (!manifest || !result) {
      issues.push(issue(
        "missing_firewall_replay_input",
        `firewall[${index}](${record.firewallId})`,
        "pinned Replay Manifest/Resultが解決できません",
      ));
      continue;
    }
    issues.push(...validateDecisionFirewallRecord(
      record,
      schema,
      manifest,
      result,
      `firewall[${index}](${record.firewallId})`,
    ));
  }
  issues.push(
    ...duplicateIssues(records.map((record) => record.firewallId), "duplicate_firewall_id", "firewall"),
    ...duplicateIssues(records.map((record) => record.contentHash), "duplicate_content_hash", "firewall"),
  );

  const byId = new Map(records.map((record) => [record.firewallId, record]));
  const superseded = new Set<string>();
  for (const record of records) {
    if (!record.supersedesFirewallId) continue;
    superseded.add(record.supersedesFirewallId);
    const previous = byId.get(record.supersedesFirewallId);
    if (!previous) {
      issues.push(issue(
        "missing_firewall_parent",
        record.firewallId,
        record.supersedesFirewallId,
      ));
      continue;
    }
    if (previous.candidateId !== record.candidateId) {
      issues.push(issue(
        "firewall_revision_candidate_mismatch",
        record.firewallId,
        "firewall revisionでcandidateIdを変更できません",
      ));
    }
    if (Date.parse(record.createdAt) <= Date.parse(previous.createdAt)) {
      issues.push(issue(
        "firewall_revision_time_not_monotonic",
        record.firewallId,
        "createdAtは直前recordより後である必要があります",
      ));
    }
    if (Date.parse(record.informationCutoff) < Date.parse(previous.informationCutoff)) {
      issues.push(issue(
        "firewall_cutoff_regression",
        record.firewallId,
        "informationCutoffを過去へ戻せません",
      ));
    }
  }

  const headCounts = new Map<string, number>();
  for (const record of records.filter((item) => !superseded.has(item.firewallId))) {
    headCounts.set(record.candidateId, (headCounts.get(record.candidateId) ?? 0) + 1);
  }
  for (const [candidateId, count] of headCounts) {
    if (count > 1) {
      issues.push(issue(
        "multiple_firewall_heads",
        candidateId,
        `${count} active heads`,
      ));
    }
  }
  return sortIssues(issues);
}

export function parseDecisionFirewallJsonl(
  content: string,
  sourceName: string,
): DecisionFirewallRecord[] {
  const records: DecisionFirewallRecord[] = [];
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as DecisionFirewallRecord);
    } catch (error) {
      throw new Error(`${sourceName}:${index + 1}: ${(error as Error).message}`);
    }
  }
  return records;
}

function readFirewallFile(path: string): DecisionFirewallRecord[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseDecisionFirewallJsonl(content, path);
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const owner = JSON.parse(readFileSync(`${lockPath}/owner.json`, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(`Decision Firewall lock ownership changed; refusing to remove ${lockPath}`);
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendDecisionFirewallRecords(
  path: string,
  incoming: DecisionFirewallRecord[],
  ownerToken: string,
  schema: JsonSchema,
  manifests: Map<string, CouncilReplayManifest>,
  replayResults: Map<string, CouncilReplayResult>,
): void {
  if (incoming.length === 0) return;
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Decision Firewall lock is already held: ${lockPath}`);
    }
    throw error;
  }

  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    const existing = readFirewallFile(path);
    const errors = validateDecisionFirewallLedger(
      [...existing, ...incoming],
      schema,
      manifests,
      replayResults,
    ).filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
    }
    const fd = openSync(path, "a");
    try {
      appendFileSync(fd, `${incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } finally {
    releaseLock(lockPath, ownerToken);
  }
}
