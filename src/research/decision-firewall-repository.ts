import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DECISION_FIREWALL_PATHS,
  parseDecisionFirewallJsonl,
  validateDecisionFirewallLedger,
  type DecisionFirewallRecord,
} from "./decision-firewall.js";
import {
  COUNCIL_REPLAY_PATHS,
  validateCouncilReplayRepository,
} from "./stock-pro-council-replay-repository.js";
import type {
  CouncilReplayManifest,
  CouncilReplayResult,
} from "./stock-pro-council-replay.js";
import {
  loadCouncilSchema,
  type CouncilIssue,
} from "./stock-pro-council-v2-validation.js";

export type DecisionFirewallRepositoryOptions = {
  recordsPath?: string;
  replayManifestDir?: string;
  verdictDir?: string;
  dissentPath?: string;
  vetoPath?: string;
  calibrationDir?: string;
};

export type DecisionFirewallRepositoryResult = {
  issues: CouncilIssue[];
  recordCount: number;
  activeHeadCount: number;
  stockEligibleHeadCount: number;
  personalEligibleHeadCount: number;
  records: DecisionFirewallRecord[];
};

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

function readFirewallRecords(path: string): {
  records: DecisionFirewallRecord[];
  issues: CouncilIssue[];
} {
  if (!existsSync(path)) return { records: [], issues: [] };
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    return {
      records: [],
      issues: [issue(
        "partial_firewall_tail",
        path,
        "final newlineがなくpartial writeの可能性があります",
      )],
    };
  }
  try {
    return { records: parseDecisionFirewallJsonl(content, path), issues: [] };
  } catch (error) {
    return {
      records: [],
      issues: [issue("invalid_firewall_jsonl", path, (error as Error).message)],
    };
  }
}

function readReplayManifests(dir: string): {
  manifests: CouncilReplayManifest[];
  issues: CouncilIssue[];
} {
  if (!existsSync(dir)) return { manifests: [], issues: [] };
  const manifests: CouncilReplayManifest[] = [];
  const issues: CouncilIssue[] = [];
  for (const filename of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const path = join(dir, filename);
    try {
      manifests.push(JSON.parse(readFileSync(path, "utf-8")) as CouncilReplayManifest);
    } catch (error) {
      issues.push(issue("invalid_replay_manifest_json", path, (error as Error).message));
    }
  }
  return { manifests, issues };
}

function activeHeads(records: DecisionFirewallRecord[]): DecisionFirewallRecord[] {
  const superseded = new Set(
    records.flatMap((record) => record.supersedesFirewallId ? [record.supersedesFirewallId] : []),
  );
  return records.filter((record) => !superseded.has(record.firewallId));
}

export function validateDecisionFirewallRepository(
  options: DecisionFirewallRepositoryOptions = {},
): DecisionFirewallRepositoryResult {
  const recordsPath = options.recordsPath ?? DECISION_FIREWALL_PATHS.records;
  const replayManifestDir = options.replayManifestDir ?? COUNCIL_REPLAY_PATHS.manifestDir;
  const replay = validateCouncilReplayRepository({
    manifestDir: replayManifestDir,
    verdictDir: options.verdictDir,
    dissentPath: options.dissentPath,
    vetoPath: options.vetoPath,
    calibrationDir: options.calibrationDir,
  });
  const recordRead = readFirewallRecords(recordsPath);
  const manifestRead = readReplayManifests(replayManifestDir);
  const issues: CouncilIssue[] = [
    ...replay.issues,
    ...recordRead.issues,
    ...manifestRead.issues,
  ];
  const schema = loadCouncilSchema(DECISION_FIREWALL_PATHS.schema);
  const manifests = new Map(
    manifestRead.manifests.map((manifest) => [manifest.contentHash, manifest]),
  );
  const replayResults = new Map<string, CouncilReplayResult>(
    replay.results.map((result) => [result.resultHash, result]),
  );
  issues.push(...validateDecisionFirewallLedger(
    recordRead.records,
    schema,
    manifests,
    replayResults,
  ));

  const heads = activeHeads(recordRead.records);
  return {
    issues: sortIssues(issues),
    recordCount: recordRead.records.length,
    activeHeadCount: heads.length,
    stockEligibleHeadCount: heads.filter(
      (record) => record.stockRecommendationCandidateEligible,
    ).length,
    personalEligibleHeadCount: heads.filter(
      (record) => record.personalRecommendationCandidateEligible,
    ).length,
    records: recordRead.records,
  };
}
