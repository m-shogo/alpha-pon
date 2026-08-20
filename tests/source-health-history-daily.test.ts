import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addDaysJst, todayJst } from "../src/date.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-source-health-history-"));
const tsxImport = import.meta.resolve("tsx/esm");
try {
  mkdirSync(join(root, "data"), { recursive: true });
  const today = todayJst();
  const yesterday = addDaysJst(today, -1);
  writeFileSync(
    join(root, "data/source_health_history.jsonl"),
    [
      JSON.stringify({ date: yesterday, reports: { sourceHealth: { exists: false, size: 0 } } }),
      JSON.stringify({ date: today, reports: { sourceHealth: { exists: false, size: 0 } } }),
      "{malformed historical row",
      JSON.stringify({ date: yesterday, reports: { sourceHealth: { exists: true, size: 8 } } }),
      JSON.stringify({ date: today, reports: { sourceHealth: { exists: true, size: 10 } } }),
      "",
    ].join("\n"),
    "utf8",
  );

  const source = resolve("src/source-health-history.ts");
  execFileSync(process.execPath, ["--import", tsxImport, source], {
    cwd: root,
    stdio: "pipe",
  });
  execFileSync(process.execPath, ["--import", tsxImport, source], {
    cwd: root,
    stdio: "pipe",
  });

  const lines = readFileSync(join(root, "data/source_health_history.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean);
  const validRows = lines.flatMap(line => {
    try {
      return [JSON.parse(line) as { date?: string; reports?: { sourceHealth?: { size?: number } } }];
    } catch {
      return [];
    }
  });

  assert.equal(
    validRows.filter(row => row.date === today).length,
    1,
    "same-day reruns must keep one source-health history row so a 14-row window remains a 14-day window",
  );
  assert.equal(
    validRows.filter(row => row.date === yesterday).length,
    1,
    "existing duplicate dates must also collapse so stale duplicates cannot keep biasing the 14-day window",
  );
  assert.equal(
    validRows.find(row => row.date === yesterday)?.reports?.sourceHealth?.size,
    8,
    "when historical dates are duplicated, the latest recorded row must remain authoritative",
  );
  assert.ok(
    lines.includes("{malformed historical row"),
    "daily upsert must preserve malformed historical evidence for downstream read-only audit visibility",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("source-health-history-daily.test.ts passed");