import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProposalPipelineStatus } from "../src/proposals-pipeline-input.js";

type PipelineStatus = {
  status?: string;
  failedSteps?: string;
  steps?: Array<{
    name: string;
    criticality: string;
    status: string;
    code: number;
  }>;
};

const dir = mkdtempSync(join(tmpdir(), "proposals-pipeline-input-"));
const path = join(dir, "pipeline_status_latest.json");

try {
  writeFileSync(path, JSON.stringify({
    status: "partial_failed",
    failedSteps: "daily:core",
    steps: [{ name: "daily:core", criticality: "critical", status: "failed", code: 1 }],
  }), "utf-8");
  assert.deepEqual(
    readProposalPipelineStatus<PipelineStatus>(path)?.steps?.map(step => step.name),
    ["daily:core"],
    "canonical pipeline rows remain usable",
  );

  writeFileSync(path, JSON.stringify({ status: "ok", steps: "broken" }), "utf-8");
  assert.equal(
    readProposalPipelineStatus<PipelineStatus>(path),
    null,
    "a non-array steps root must fail closed instead of reaching Array.filter in proposals",
  );

  writeFileSync(path, JSON.stringify({ status: "ok", steps: [null] }), "utf-8");
  assert.equal(
    readProposalPipelineStatus<PipelineStatus>(path),
    null,
    "an unsafe pipeline step row must fail closed instead of crashing proposal generation",
  );

  for (const step of [
    {},
    { name: "daily:core", criticality: "critical", status: "failed" },
    { name: " daily:core ", criticality: "critical", status: "failed", code: 1 },
    { name: "daily:core", criticality: " critical", status: "failed", code: 1 },
    { name: "daily:core", criticality: "critical ", status: "failed", code: 1 },
    { name: "daily:core", criticality: "unknown", status: "failed", code: 1 },
    { name: "daily:core", criticality: "critical", status: " failed", code: 1 },
    { name: "daily:core", criticality: "critical", status: "unknown", code: 1 },
    { name: "daily:core", criticality: "critical", status: "failed", code: "1" },
    { name: "daily:core", criticality: "critical", status: "failed", code: 0 },
    { name: "daily:core", criticality: "critical", status: "ok", code: 1 },
    { name: "daily:core", criticality: "noncritical", status: "skipped", code: 1 },
    { name: "daily:core", criticality: "critical", status: "failed", code: -1 },
    { name: "daily:core", criticality: "critical", status: "failed", code: 1.5 },
    { name: "daily:core", criticality: "critical", status: "failed", code: 256 },
  ]) {
    writeFileSync(path, JSON.stringify({ status: "partial_failed", steps: [step] }), "utf-8");
    assert.equal(
      readProposalPipelineStatus<PipelineStatus>(path),
      null,
      "a noncanonical pipeline step must not disappear from proposal failure evidence",
    );
  }

  writeFileSync(path, "{", "utf-8");
  assert.equal(
    readProposalPipelineStatus<PipelineStatus>(path),
    null,
    "malformed pipeline JSON remains fail closed",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("proposals-pipeline-input: malformed pipeline shape regressions OK");
