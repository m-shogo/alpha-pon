import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { chdir, cwd } from "process";
import { recordProposalHistory } from "../src/proposal-history.js";

const previousCwd = cwd();
const dir = mkdtempSync(join(tmpdir(), "alpha-pon-proposal-history-"));

try {
  chdir(dir);
  recordProposalHistory("2026-08-21", [
    { date: "2026-08-21", priority: "S", title: "同一提案", reason: "r1", action: "a1" },
    { date: "2026-08-21", priority: "S", title: "同一提案", reason: "r2", action: "a2" },
  ]);

  const rows = readFileSync("data/proposals_history.jsonl", "utf-8")
    .trim()
    .split("\n")
    .map(line => JSON.parse(line) as { title: string });
  assert.equal(rows.length, 1, "same-run duplicate proposal identity must append only once");
  assert.equal(rows[0]?.title, "同一提案");

  recordProposalHistory("2026-08-21", [
    { date: "2026-08-21", priority: "S", title: "同一提案", reason: "r3", action: "a3" },
  ]);
  const rerunRows = readFileSync("data/proposals_history.jsonl", "utf-8").trim().split("\n");
  assert.equal(rerunRows.length, 1, "rerun duplicate proposal identity must remain deduped");
} finally {
  chdir(previousCwd);
  rmSync(dir, { recursive: true, force: true });
}

console.log("proposal history: same-run and rerun identities are deduped");
