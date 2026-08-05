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
  validateDecisionFirewallLifecycle,
} from "./decision-firewall-hardening.js";
import {
  buildDecisionFirewallRecord,
  parseDecisionFirewallJsonl,
  validateDecisionFirewallLedger,
  validateDecisionFirewallRecord,
  type DecisionFirewallAssessmentInput,
  type DecisionFirewallRecord,
  type UnknownBudgetEntry,
} from "./decision-firewall.js";
import {
  computeReplayManifestHash,
  type CouncilReplayManifest,
  type CouncilReplayResult,
} from "./stock-pro-council-replay.js";
import type { CouncilIssue } from "./stock-pro-council-v2-validation.js";
import type { JsonSchema } from "./schema.js";

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

function unknownSeverityIssues(
  entries: UnknownBudgetEntry[],
  target: string,
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  for (const entry of entries) {
    if (entry.status === "unknown" && entry.severity !== "blocking") {
      issues.push(issue(
        "unknown_not_marked_blocking",
        `${target}.${entry.category}`,
        "status=unknownは必ずseverity=blockingとして扱います",
      ));
    }
    if (entry.status !== "unknown" && entry.severity !== "informational") {
      issues.push(issue(
        "resolved_unknown_still_blocking",
        `${target}.${entry.category}`,
        `${entry.status}はseverity=informationalである必要があります`,
      ));
    }
  }
  return issues;
}

function assertReplayInputs(
  manifest: CouncilReplayManifest,
  replayResult: CouncilReplayResult,
): void {
  if (manifest.contentHash !== computeReplayManifestHash(manifest)) {
    throw new Error("invalid_replay_manifest_hash: Decision Firewallへ改ざんされたmanifestを渡せません");
  }
  if (
    replayResult.replayId !== manifest.replayId ||
    replayResult.councilRunId !== manifest.councilRunId ||
    replayResult.informationCutoff !== manifest.informationCutoff ||
    replayResult.manifestHash !== manifest.contentHash
  ) {
    throw new Error("firewall_replay_identity_mismatch: Replay ResultとManifestが一致しません");
  }
}

export function buildDecisionFirewallRecordGoverned(
  input: DecisionFirewallAssessmentInput,
  manifest: CouncilReplayManifest,
  replayResult: CouncilReplayResult,
): DecisionFirewallRecord {
  assertReplayInputs(manifest, replayResult);
  const unknownIssues = unknownSeverityIssues(input.unknownBudget, "unknownBudget");
  if (unknownIssues.length > 0) {
    throw new Error(
      unknownIssues.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"),
    );
  }
  return buildDecisionFirewallRecord(input, manifest, replayResult);
}

export function validateDecisionFirewallRecordGoverned(
  record: DecisionFirewallRecord,
  schema: JsonSchema,
  manifest: CouncilReplayManifest,
  replayResult: CouncilReplayResult,
  target = "DecisionFirewallRecord",
): CouncilIssue[] {
  const issues = [
    ...validateDecisionFirewallRecord(record, schema, manifest, replayResult, target),
    ...unknownSeverityIssues(record.unknownBudget, `${target}.unknownBudget`),
  ];
  if (manifest.contentHash !== computeReplayManifestHash(manifest)) {
    issues.push(issue(
      "invalid_replay_manifest_hash",
      `${target}.replayManifestHash`,
      "Replay Manifest contentHashが一致しません",
    ));
  }
  return sortIssues(issues);
}

export function validateDecisionFirewallLedgerGovernedStrict(
  records: DecisionFirewallRecord[],
  schema: JsonSchema,
  manifests: Map<string, CouncilReplayManifest>,
  replayResults: Map<string, CouncilReplayResult>,
): CouncilIssue[] {
  const issues = [
    ...validateDecisionFirewallLedger(records, schema, manifests, replayResults),
    ...validateDecisionFirewallLifecycle(records),
  ];
  for (const [index, record] of records.entries()) {
    const manifest = manifests.get(record.replayManifestHash);
    const replayResult = replayResults.get(record.replayResultHash);
    if (!manifest || !replayResult) continue;
    issues.push(...validateDecisionFirewallRecordGoverned(
      record,
      schema,
      manifest,
      replayResult,
      `firewall[${index}](${record.firewallId})`,
    ));
  }
  return sortIssues(issues);
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

export function appendDecisionFirewallRecordsGovernedStrict(
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
    const errors = validateDecisionFirewallLedgerGovernedStrict(
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
