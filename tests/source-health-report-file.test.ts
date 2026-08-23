import assert from "node:assert/strict";
import { linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectSourceHealthReportFile } from "../src/source-health-report-file.js";
import "./source-health-history-daily.test.js";

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

  const linkedReportPath = join(root, "linked-report.md");
  symlinkSync(reportPath, linkedReportPath);
  assert.deepEqual(
    inspectSourceHealthReportFile(linkedReportPath),
    { exists: false, size: 0 },
    "symlinked reports must not inherit canonical source-health provenance"
  );

  const hardLinkedReportPath = join(root, "hard-linked-report.md");
  linkSync(reportPath, hardLinkedReportPath);
  assert.deepEqual(
    inspectSourceHealthReportFile(hardLinkedReportPath),
    { exists: false, size: 0 },
    "hard-linked reports must not reuse another path's canonical source-health provenance"
  );
  rmSync(hardLinkedReportPath);

  const blankReportPath = join(root, "blank.md");
  writeFileSync(blankReportPath, " \n\t", "utf-8");
  assert.deepEqual(
    inspectSourceHealthReportFile(blankReportPath),
    { exists: false, size: 0 },
    "blank-only report files must fail closed instead of creating false-healthy source history"
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

console.log("source health report file: unreadable, linked, or blank paths fail closed without crashing OK");