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
  HYPOTHESIS_SCENARIO_PATHS,
  parseHypothesisScenarioJsonl,
  type HypothesisScenarioIssue,
  type HypothesisScenarioRecord,
  type HypothesisScenarioSet,
  type TestableHypothesisRecord,
} from "./testable-hypothesis-scenario.js";
import {
  validateHypothesisScenarioLedgers,
} from "./testable-hypothesis-scenario-ledger.js";

export type HypothesisScenarioStorePaths = {
  hypotheses: string;
  scenarios: string;
  scenarioSets: string;
};

export type HypothesisScenarioAppendBatch = {
  hypotheses: TestableHypothesisRecord[];
  scenarios: HypothesisScenarioRecord[];
  scenarioSets: HypothesisScenarioSet[];
};

export type HypothesisScenarioStoreValidator = (
  hypotheses: TestableHypothesisRecord[],
  scenarios: HypothesisScenarioRecord[],
  scenarioSets: HypothesisScenarioSet[],
) => HypothesisScenarioIssue[];

export const DEFAULT_HYPOTHESIS_SCENARIO_STORE_PATHS: HypothesisScenarioStorePaths = {
  hypotheses: HYPOTHESIS_SCENARIO_PATHS.hypotheses,
  scenarios: HYPOTHESIS_SCENARIO_PATHS.scenarios,
  scenarioSets: HYPOTHESIS_SCENARIO_PATHS.scenarioSets,
};

function readStrict<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  if (content.length > 0 && !content.endsWith("\n")) {
    throw new Error(`${path}: final newlineがなくpartial writeの可能性があります`);
  }
  return parseHypothesisScenarioJsonl<T>(content, path);
}

function fsyncPath(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeJournal(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf-8");
  fsyncPath(path);
}

function appendRows(path: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  const fd = openSync(path, "a");
  try {
    appendFileSync(
      fd,
      `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
      "utf-8",
    );
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function releaseLock(lockPath: string, ownerToken: string): void {
  const ownerPath = `${lockPath}/owner.json`;
  if (!existsSync(ownerPath)) {
    throw new Error(`Hypothesis Scenario lock owner metadata is missing: ${ownerPath}`);
  }
  const owner = JSON.parse(readFileSync(ownerPath, "utf-8")) as {
    ownerToken?: unknown;
  };
  if (owner.ownerToken !== ownerToken) {
    throw new Error(
      `Hypothesis Scenario lock ownership changed; refusing to remove ${lockPath}`,
    );
  }
  rmSync(lockPath, { recursive: true, force: false });
}

export function appendHypothesisScenarioRecordsGoverned(
  paths: HypothesisScenarioStorePaths,
  incoming: HypothesisScenarioAppendBatch,
  ownerToken: string,
  validateStore: HypothesisScenarioStoreValidator,
): void {
  if (
    incoming.hypotheses.length === 0 &&
    incoming.scenarios.length === 0 &&
    incoming.scenarioSets.length === 0
  ) {
    return;
  }
  if (!ownerToken.trim()) throw new Error("ownerToken is required");
  mkdirSync(dirname(paths.hypotheses), { recursive: true });
  mkdirSync(dirname(paths.scenarios), { recursive: true });
  mkdirSync(dirname(paths.scenarioSets), { recursive: true });

  const lockPath = `${paths.hypotheses}.hypothesis-scenario.lock`;
  const journalPath = `${paths.hypotheses}.batch-journal.json`;
  if (existsSync(journalPath)) {
    throw new Error(`incomplete_hypothesis_scenario_batch: ${journalPath}`);
  }
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Hypothesis Scenario lock is already held: ${lockPath}`);
    }
    throw error;
  }

  let ownerWritten = false;
  try {
    writeFileSync(
      `${lockPath}/owner.json`,
      `${JSON.stringify({ ownerToken, acquiredAt: new Date().toISOString() })}\n`,
      { encoding: "utf-8", flag: "wx" },
    );
    ownerWritten = true;

    const nextHypotheses = [
      ...readStrict<TestableHypothesisRecord>(paths.hypotheses),
      ...incoming.hypotheses,
    ];
    const nextScenarios = [
      ...readStrict<HypothesisScenarioRecord>(paths.scenarios),
      ...incoming.scenarios,
    ];
    const nextScenarioSets = [
      ...readStrict<HypothesisScenarioSet>(paths.scenarioSets),
      ...incoming.scenarioSets,
    ];
    const errors = [
      ...validateStore(nextHypotheses, nextScenarios, nextScenarioSets),
      ...validateHypothesisScenarioLedgers(
        nextHypotheses,
        nextScenarios,
        nextScenarioSets,
      ),
    ].filter((item) => item.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        errors.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"),
      );
    }

    const journalBase = {
      ownerToken,
      hypothesisCount: incoming.hypotheses.length,
      scenarioCount: incoming.scenarios.length,
      scenarioSetCount: incoming.scenarioSets.length,
    };
    writeJournal(journalPath, { ...journalBase, state: "prepared" });
    appendRows(paths.hypotheses, incoming.hypotheses);
    writeJournal(journalPath, { ...journalBase, state: "hypotheses_appended" });
    appendRows(paths.scenarios, incoming.scenarios);
    writeJournal(journalPath, { ...journalBase, state: "scenarios_appended" });
    appendRows(paths.scenarioSets, incoming.scenarioSets);
    writeJournal(journalPath, { ...journalBase, state: "committed" });
    rmSync(journalPath, { force: false });
  } finally {
    if (ownerWritten) {
      releaseLock(lockPath, ownerToken);
    } else if (existsSync(lockPath)) {
      rmSync(lockPath, { recursive: true, force: true });
    }
  }
}
