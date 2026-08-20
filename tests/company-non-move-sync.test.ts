import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { addDaysJst, todayJst } from "../src/date.js";

const root = mkdtempSync(join(tmpdir(), "alpha-pon-company-non-move-"));
const tsxImport = import.meta.resolve("tsx/esm");
const source = fileURLToPath(new URL("../src/company-non-move-sync.ts", import.meta.url));
try {
  mkdirSync(join(root, "data"), { recursive: true });
  const date = todayJst();
  const outcome = {
    schemaVersion: 1,
    createdAt: date,
    evaluatedAt: date,
    candidateCode: "1001",
    candidateName: "Synthetic Co",
    direction: "mixed",
    quality: "useful",
    eventId: "synthetic-event",
    timeframe: "1w",
    lessonId: "synthetic-lesson",
    lessonTitle: "synthetic lesson",
    actualOutcome: "synthetic outcome",
    dataAvailability: "missing",
    missedSignals: [],
    whatMatched: [],
    whatDiffered: [],
    improvedRuleIdeas: [],
  };
  const futureOutcome = {
    ...outcome,
    eventId: "future-event",
    evaluatedAt: addDaysJst(date, 1),
  };
  const sourceKey = "analogy:synthetic-event:1w";
  const malformedHistoricalRow = {
    date,
    code: "1001",
    source: sourceKey,
  };
  writeFileSync(
    join(root, "data/analogy_outcomes.jsonl"),
    `{malformed source row\n{}\n${JSON.stringify(futureOutcome)}\n${JSON.stringify(outcome)}\n${JSON.stringify(outcome)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "data/company_non_move_history.jsonl"),
    `{malformed historical row\n${JSON.stringify(malformedHistoricalRow)}\n`,
    "utf8",
  );

  execFileSync(process.execPath, ["--import", tsxImport, source], { cwd: root, stdio: "pipe" });
  execFileSync(process.execPath, ["--import", tsxImport, source], { cwd: root, stdio: "pipe" });

  const lines = readFileSync(join(root, "data/company_non_move_history.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean);
  const rows = lines.flatMap(line => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  const completeRows = rows.filter(row => row.name === "Synthetic Co");

  assert.equal(completeRows.length, 1, "malformed history keys must not suppress the one valid non-move history row");
  assert.ok(
    lines.includes("{malformed historical row"),
    "malformed existing history must remain visible for downstream audit instead of being rewritten away",
  );
  assert.ok(
    rows.some(row => row.date === date && row.code === "1001" && row.source === sourceKey && row.name === undefined),
    "JSON-valid malformed historical rows must remain visible for downstream audit",
  );
  assert.deepEqual(
    completeRows[0],
    {
      date,
      code: "1001",
      name: "Synthetic Co",
      category: "synthetic lesson",
      hypothesis: "synthetic outcome",
      outcome: "mixed",
      nonMoveReasons: ["theme_right_timing_wrong", "unknown_or_insufficient_data"],
      lesson: "外れ方を確認する",
      nextAction: "一次情報・価格・関連会社を再確認する",
      source: sourceKey,
    },
    "the single persisted row must keep the original synthetic provenance",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("company-non-move-sync.test.ts passed");
