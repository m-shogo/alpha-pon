import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalCwd = process.cwd();
const workdir = mkdtempSync(join(tmpdir(), "alpha-pon-source-health-wrapper-"));

try {
  process.chdir(workdir);
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/pipeline_status_latest.json",
    JSON.stringify({
      status: "completed",
      failedSteps: "",
      completeWrapperFailedSteps: ["stock-pro-agent(1)"],
    }),
    "utf-8",
  );

  await import("../src/source-health.js");

  const report = readFileSync("reports/source_health_latest.md", "utf-8");
  assert.match(
    report,
    /- failedSteps: stock-pro-agent\(1\)/,
    "complete-wrapper failures must be visible in Source Health failedSteps",
  );
  assert.match(
    report,
    /- 🛑 pipeline failedSteps: stock-pro-agent\(1\)/,
    "complete-wrapper failures must reach the Source Health operational decision",
  );
} finally {
  process.chdir(originalCwd);
  rmSync(workdir, { recursive: true, force: true });
}

console.log("source-health-complete-wrapper-report.test.ts passed");
