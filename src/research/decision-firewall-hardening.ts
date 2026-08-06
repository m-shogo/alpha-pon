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
  parseDecisionFirewallJsonl,
  validateDecisionFirewallLedger,
  type DecisionFirewallRecord,
} from "./decision-firewall.js";
import type {
  CouncilReplayManifest,
  CouncilReplayResult,
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

export function validateDecisionFirewallLifecycle(
  records: DecisionFirewallRecord[],
): CouncilIssue[] {
  const issues: CouncilIssue[] = [];
  const byId = new Map(records.map((record) => [record.firewallId, record]));
  for (const record of records) {
    if (record.supersedesFirewallId === record.firewallId) {
      issues.push(issue(
        "firewall_self_supersession",
        record.firewallId,
        "record自身をsupersedeできません",
      ));
    }
    const seen = new Set<string>();
    let current: DecisionFirewallRecord | undefined = record;
    while (current?.supersedesFirewallId) {
      if (seen.has(current.firewallId)) {
        issues.push(issue(
          "firewall_revision_cycle",
          record.firewallId,
          "Decision Firewall revision chainにcycleがあります",
        ));
        break;
      }
      seen.add(current.firewallId);
      current = byId.get(current.supersedesFirewallId);
    }
  }
  return sortIssues(issues);
}

export function validateDecisionFirewallLedgerGoverned(
  records: DecisionFirewallRecord[],
  schema: JsonSchema,
  manifests: Map<string, CouncilReplayManifest>,
  replayResults: Map<string, CouncilReplayResult>,
): CouncilIssue[] {
  return sortIssues([
    ...validateDecisionFirewallLedger(records, schema, manifests, replayResults),
    ...validateDecisionFirewallLifecycle(records),
  ]);
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

export function appendDecisionFirewallRecordsGoverned(
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
    const errors = validateDecisionFirewallLedgerGoverned(
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
