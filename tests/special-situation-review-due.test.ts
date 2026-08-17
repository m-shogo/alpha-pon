// 特殊状況 review due queue レポートの構造テスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { calcSpecialSituationDueAt } from "../src/special-situation-review-due-date.js";
import {
  filterOutcomesByCode,
  selectOutcomesForStats,
} from "../src/special-situation-outcome-filter.js";
import type { HypothesisOutcome, ReviewHorizon } from "../src/universe.js";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const ALLOWED_DUE_STATUS = new Set([
  "due_today",
  "due_this_week",
  "overdue",
  "historical_seed_overdue",
  "not_due_yet",
  "no_outcome_record",
]);

const ALLOWED_MISSING_FIELDS = new Set(["result", "return1w", "return1m", "topixRelative1m"]);

assert.equal(calcSpecialSituationDueAt("2026-08-07", "1d"), "2026-08-08");
assert.equal(calcSpecialSituationDueAt("2026-02-31", "1d"), null);
assert.equal(calcSpecialSituationDueAt("0000-01-01", "1d"), null);
assert.equal(calcSpecialSituationDueAt("2026-08-07T00:00:00+09:00", "1d"), null);
assert.equal(calcSpecialSituationDueAt("2026-08-07", "2w" as ReviewHorizon), null);

const validSpecialOutcome = {
  code: "8136",
  hypothesis: { reason: "[special_situation] synthetic regression" },
} as unknown as HypothesisOutcome;
const malformedMatchingOutcome = { code: "8136" } as unknown as HypothesisOutcome;
const runtimeFiltered = filterOutcomesByCode(
  [malformedMatchingOutcome, validSpecialOutcome],
  new Set(["8136"]),
  "all",
);
assert.equal(runtimeFiltered.special.length, 1, "正常なspecial outcomeは維持する");
assert.equal(runtimeFiltered.normal.length, 0, "hypothesis欠落rowをnormal outcomeとして扱わない");
const runtimeSelected = selectOutcomesForStats([malformedMatchingOutcome, validSpecialOutcome], "8136");
assert.equal(runtimeSelected.source, "special");
assert.deepEqual(runtimeSelected.selected, [validSpecialOutcome], "malformed rowを隔離して正常rowだけ集計する");

// 1) reports/special_situation_review_due_latest.json が生成される
const reportData = readJson("reports/special_situation_review_due_latest.json");
assert(reportData !== null, "reports/special_situation_review_due_latest.json は必ず生成される必要があります");
assert(isObject(reportData), "review due report は object である必要があります");

// 2) 必須フィールド
assert(typeof reportData.generatedAt === "string", "generatedAt は string");
assert(typeof reportData.today === "string", "today は string");
assert(isObject(reportData.summary), "summary は object");

// 3) summary フィールド
{
  const s = reportData.summary as Record<string, unknown>;
  assert(typeof s.totalCandidates === "number", "summary.totalCandidates は number");
  assert(typeof s.matchedOutcomes === "number", "summary.matchedOutcomes は number");
  assert(typeof s.dueToday === "number", "summary.dueToday は number");
  assert(typeof s.dueThisWeek === "number", "summary.dueThisWeek は number");
  assert(typeof s.overdue === "number", "summary.overdue は number");
  assert(typeof s.historicalSeedOverdue === "number", "summary.historicalSeedOverdue は number");
  assert(typeof s.notDueYet === "number", "summary.notDueYet は number");
  assert(typeof s.noOutcomeRecord === "number", "summary.noOutcomeRecord は number");
}

// 4) 配列フィールド
assert(Array.isArray(reportData.dueToday), "dueToday は配列");
assert(Array.isArray(reportData.dueThisWeek), "dueThisWeek は配列");
assert(Array.isArray(reportData.overdue), "overdue は配列");
assert(Array.isArray(reportData.historicalSeedOverdue), "historicalSeedOverdue は配列");
assert(Array.isArray(reportData.notDueYet), "notDueYet は配列");
assert(Array.isArray(reportData.noOutcomeRecord), "noOutcomeRecord は配列");
assert(Array.isArray(reportData.notes), "notes は配列");

// 5) ReviewDueItem の構造検証
const allItems = [
  ...reportData.dueToday as Array<Record<string, unknown>>,
  ...reportData.dueThisWeek as Array<Record<string, unknown>>,
  ...reportData.overdue as Array<Record<string, unknown>>,
  ...reportData.historicalSeedOverdue as Array<Record<string, unknown>>,
  ...reportData.notDueYet as Array<Record<string, unknown>>,
];
for (const item of allItems) {
  assert(typeof item.code === "string" && item.code.length > 0, `item.code は非空 string: ${item.code}`);
  assert(typeof item.name === "string", `item.name は string: ${item.code}`);
  assert(ALLOWED_DUE_STATUS.has(item.status as string), `不正な status: ${item.status} (code=${item.code})`);
  assert(Array.isArray(item.missingFields), `missingFields は配列: ${item.code}`);
  for (const f of item.missingFields as string[]) {
    assert(ALLOWED_MISSING_FIELDS.has(f), `不正な missingField: ${f} (code=${item.code})`);
  }
  assert(typeof item.nextAction === "string" && item.nextAction.length > 0, `nextAction は非空 string: ${item.code}`);
}

// 6) noOutcomeRecord の構造
for (const item of reportData.noOutcomeRecord as Array<Record<string, unknown>>) {
  assert(typeof item.code === "string", "noOutcomeRecord.code は string");
  assert(typeof item.name === "string", "noOutcomeRecord.name は string");
  assert(typeof item.reason === "string", "noOutcomeRecord.reason は string");
  assert(typeof item.nextAction === "string", "noOutcomeRecord.nextAction は string");
}

// 7) summary のカウントが実際の配列長と一致
{
  const s = reportData.summary as Record<string, unknown>;
  assert(s.dueToday === (reportData.dueToday as unknown[]).length,
    `summary.dueToday (${s.dueToday}) と dueToday 配列長が一致しない`);
  assert(s.overdue === (reportData.overdue as unknown[]).length,
    `summary.overdue (${s.overdue}) と overdue 配列長が一致しない`);
  assert(s.historicalSeedOverdue === (reportData.historicalSeedOverdue as unknown[]).length,
    `summary.historicalSeedOverdue (${s.historicalSeedOverdue}) と historicalSeedOverdue 配列長が一致しない`);
  assert(s.notDueYet === (reportData.notDueYet as unknown[]).length,
    `summary.notDueYet (${s.notDueYet}) と notDueYet 配列長が一致しない`);
  assert(s.noOutcomeRecord === (reportData.noOutcomeRecord as unknown[]).length,
    `summary.noOutcomeRecord と noOutcomeRecord 配列長が一致しない`);
}

// 8) notes に免責事項
assert(
  (reportData.notes as string[]).some(n => n.includes("売買推奨ではありません")),
  "notes に「売買推奨ではありません」が含まれる"
);

// 9) 禁止文言テスト
const text = JSON.stringify(reportData) + "\n" + (existsSync("reports/special_situation_review_due_latest.md")
  ? readFileSync("reports/special_situation_review_due_latest.md", "utf-8")
  : "");
for (const forbidden of ["買うべき", "売るべき", "必ず上がる", "確実に上がる", "推奨銘柄"]) {
  assert(!text.includes(forbidden), `禁止文言 ${forbidden} を含めない`);
}

console.log("special-situation-review-due.test.ts passed");
