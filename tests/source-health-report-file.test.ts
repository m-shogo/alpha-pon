import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectSourceHealthReportFile } from "../src/source-health-report-file.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-source-health-report-"));
try {
  const missing = inspectSourceHealthReportFile(join(root, "missing.md"));
  assert.deepEqual(missing, { exists: false, size: 0 }, "missing reports must stay non-fatal and unavailable");

  const reportPath = join(root, "report.md");
  writeFileSync(reportPath, "healthy\n", "utf-8");
  assert.deepEqual(
    inspectSourceHealthReportFile(reportPath),
    { exists: true, size: 8 },
    "regular report files must retain their readable byte count"
  );

  const directoryPath = join(root, "report-directory");
  mkdirSync(directoryPath);
  assert.deepEqual(
    inspectSourceHealthReportFile(directoryPath),
    { exists: false, size: 0 },
    "directories at report paths must fail closed instead of crashing history generation"
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("source health report file: unreadable paths fail closed without crashing OK");
