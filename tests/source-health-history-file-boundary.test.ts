import assert from "node:assert/strict";
import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegimeHistoryLines, replaceRegimeHistory } from "../src/regime-history-file.js";
import { readSourceHealthHistoryLines, replaceSourceHealthHistory } from "../src/source-health-history-file.js";

type ReadHistoryLines = (path: string) => string[];
type ReplaceHistory = (path: string, content: string) => void;

function assertHistoryFileBoundary(
  label: string,
  readHistoryLines: ReadHistoryLines,
  replaceHistory: ReplaceHistory,
): void {
  const dir = mkdtempSync(join(tmpdir(), `alpha-pon-${label}-history-`));
  try {
    const historyPath = join(dir, "history.jsonl");
    const aliasTarget = join(dir, "target.jsonl");
    writeFileSync(historyPath, '{"date":"2026-08-25"}\n', "utf-8");

    assert.deepEqual(readHistoryLines(historyPath), ['{"date":"2026-08-25"}'], `${label} standalone history remains readable`);
    replaceHistory(historyPath, '{"date":"2026-08-26"}\n');
    assert.equal(readFileSync(historyPath, "utf-8"), '{"date":"2026-08-26"}\n', `${label} standalone history remains replaceable`);

    rmSync(historyPath);
    writeFileSync(aliasTarget, "original\n", "utf-8");
    symlinkSync(aliasTarget, historyPath);
    assert.throws(() => readHistoryLines(historyPath), /standalone regular file/, `${label} symlink history input must fail closed`);
    assert.throws(() => replaceHistory(historyPath, "replacement\n"), /standalone regular file/, `${label} symlink history output must fail closed`);
    assert.equal(readFileSync(aliasTarget, "utf-8"), "original\n", `${label} symlink target must remain untouched`);

    rmSync(historyPath);
    linkSync(aliasTarget, historyPath);
    assert.throws(() => readHistoryLines(historyPath), /standalone regular file/, `${label} hard-linked history input must fail closed`);
    assert.throws(() => replaceHistory(historyPath, "replacement\n"), /standalone regular file/, `${label} hard-linked history output must fail closed`);
    assert.equal(readFileSync(aliasTarget, "utf-8"), "original\n", `${label} hard-link target must remain untouched`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

assertHistoryFileBoundary("source-health", readSourceHealthHistoryLines, replaceSourceHealthHistory);
assertHistoryFileBoundary("regime", readRegimeHistoryLines, replaceRegimeHistory);

console.log("source-health-history-file-boundary.test.ts passed");
