import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-readiness-pipeline-"));
try {
  mkdirSync(join(root, "apps/web/public/generated"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { health: "x", backup: "x", "daily:full": "x" } }), "utf8");
  writeFileSync(
    join(root, "apps/web/public/generated/alpha-pon-data.json"),
    JSON.stringify({
      pipelineStatus: {
        status: "partial_failed",
        failedSteps: "daily-one(1) daily-two(1)",
        completeWrapperFailedSteps: ["wrapper-one(1)"],
      },
    }),
    "utf8",
  );

  execFileSync(process.execPath, ["--import", "tsx", resolve("src/readiness-audit.ts")], {
    cwd: root,
    env: { ...process.env, JQUANTS_API_KEY: "" },
    stdio: "pipe",
  });

  const report = JSON.parse(readFileSync(join(root, "reports/readiness_latest.json"), "utf8")) as {
    items: Array<{ id: string; evidence: string[] }>;
  };
  const pipeline = report.items.find(item => item.id === "pipeline");
  assert.ok(pipeline, "readiness report should contain the pipeline item");
  const failureEvidence = pipeline.evidence.find(entry => entry.startsWith("failed/skipped:"));
  assert.equal(
    failureEvidence,
    "failed/skipped: daily-one(1), daily-two(1), wrapper-one(1)",
    "readiness must surface run-daily and complete-wrapper failure evidence together",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
