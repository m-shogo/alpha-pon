// 特殊状況ウォッチ ops summary レポートの構造テスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 1) reports/special_situation_ops_summary_latest.json が生成されている
const reportData = readJson("reports/special_situation_ops_summary_latest.json");
assert(reportData !== null, "reports/special_situation_ops_summary_latest.json は必ず生成される必要があります");
assert(isObject(reportData), "ops summary report は object である必要があります");

// 2) 必須トップレベルフィールド
assert(typeof reportData.generatedAt === "string", "generatedAt は string");
assert(typeof reportData.today === "string", "today は string");
assert(["ok", "needs_attention", "action_required"].includes(reportData.healthStatus as string),
  `不正な healthStatus: ${reportData.healthStatus}`);
assert(Array.isArray(reportData.actionItems), "actionItems は配列");
assert(Array.isArray(reportData.notes), "notes は配列");

// 3) coverage
assert(isObject(reportData.coverage), "coverage は object");
{
  const c = reportData.coverage as Record<string, unknown>;
  assert(typeof c.totalCandidates === "number", "coverage.totalCandidates は number");
  assert(typeof c.withSpecialOutcome === "number", "coverage.withSpecialOutcome は number");
  assert(typeof c.noOutcomeRecord === "number", "coverage.noOutcomeRecord は number");
  assert(Array.isArray(c.noOutcomeRecordCodes), "coverage.noOutcomeRecordCodes は配列");
  assert(typeof c.needSeed === "boolean", "coverage.needSeed は boolean");
  assert(c.noOutcomeRecord === (c.noOutcomeRecordCodes as unknown[]).length,
    "coverage.noOutcomeRecord と noOutcomeRecordCodes.length が一致しない");
}

// 4) reviewDue
assert(isObject(reportData.reviewDue), "reviewDue は object");
{
  const rd = reportData.reviewDue as Record<string, unknown>;
  assert(typeof rd.overdue === "number", "reviewDue.overdue は number");
  assert(typeof rd.historicalSeedOverdue === "number", "reviewDue.historicalSeedOverdue は number");
  assert(typeof rd.dueToday === "number", "reviewDue.dueToday は number");
  assert(typeof rd.dueThisWeek === "number", "reviewDue.dueThisWeek は number");
  assert(typeof rd.notDueYet === "number", "reviewDue.notDueYet は number");
  assert(Array.isArray(rd.overdueItems), "reviewDue.overdueItems は配列");
  assert(Array.isArray(rd.historicalSeedOverdueItems), "reviewDue.historicalSeedOverdueItems は配列");
  assert(Array.isArray(rd.dueTodayItems), "reviewDue.dueTodayItems は配列");
  assert(rd.overdue === (rd.overdueItems as unknown[]).length,
    `reviewDue.overdue (${rd.overdue}) と overdueItems.length が一致しない`);
  assert(rd.historicalSeedOverdue === (rd.historicalSeedOverdueItems as unknown[]).length,
    `reviewDue.historicalSeedOverdue (${rd.historicalSeedOverdue}) と historicalSeedOverdueItems.length が一致しない`);
  assert(rd.dueToday === (rd.dueTodayItems as unknown[]).length,
    `reviewDue.dueToday (${rd.dueToday}) と dueTodayItems.length が一致しない`);
}

// 5) reviewDue 明細の構造検証
const ALLOWED_HORIZONS = new Set(["1d", "1w", "1m", "3m"]);
const ALLOWED_MISSING_FIELDS = new Set(["result", "return1w", "return1m", "topixRelative1m"]);
const allDueItems = [
  ...(reportData.reviewDue as Record<string, unknown>).overdueItems as Array<Record<string, unknown>>,
  ...(reportData.reviewDue as Record<string, unknown>).historicalSeedOverdueItems as Array<Record<string, unknown>>,
  ...(reportData.reviewDue as Record<string, unknown>).dueTodayItems as Array<Record<string, unknown>>,
];
for (const item of allDueItems) {
  assert(typeof item.code === "string" && item.code.length > 0, `item.code は非空 string`);
  assert(typeof item.name === "string", `item.name は string (code=${item.code})`);
  assert(ALLOWED_HORIZONS.has(item.horizon as string), `不正な horizon: ${item.horizon} (code=${item.code})`);
  assert(typeof item.dueAt === "string", `item.dueAt は string (code=${item.code})`);
  assert(Array.isArray(item.missingFields), `missingFields は配列 (code=${item.code})`);
  for (const f of item.missingFields as string[]) {
    assert(ALLOWED_MISSING_FIELDS.has(f), `不正な missingField: ${f} (code=${item.code})`);
  }
}

// 6) backfill
assert(isObject(reportData.backfill), "backfill は object");
{
  const b = reportData.backfill as Record<string, unknown>;
  assert(typeof b.structurallyUpdatable === "number", "backfill.structurallyUpdatable は number");
  assert(typeof b.historicalUpdatable === "number", "backfill.historicalUpdatable は number");
  assert(typeof b.recentUpdatable === "number", "backfill.recentUpdatable は number");
  assert(typeof b.notDueYet === "number", "backfill.notDueYet は number");
  assert(Array.isArray(b.updatableItems), "backfill.updatableItems は配列");
  assert(b.structurallyUpdatable === (b.updatableItems as unknown[]).length,
    `backfill.structurallyUpdatable (${b.structurallyUpdatable}) と updatableItems.length が一致しない`);
  assert((b.recentUpdatable as number) + (b.historicalUpdatable as number) === b.structurallyUpdatable,
    `recentUpdatable(${b.recentUpdatable}) + historicalUpdatable(${b.historicalUpdatable}) が structurallyUpdatable(${b.structurallyUpdatable}) と一致しない`);
}

// 7) outcomeStats
assert(isObject(reportData.outcomeStats), "outcomeStats は object");
{
  const os = reportData.outcomeStats as Record<string, unknown>;
  assert(typeof os.sampleTooSmall === "number", "outcomeStats.sampleTooSmall は number");
  assert(typeof os.hasStats === "number", "outcomeStats.hasStats は number");
  assert(Array.isArray(os.sampleSmallItems), "outcomeStats.sampleSmallItems は配列");
  assert(os.sampleTooSmall === (os.sampleSmallItems as unknown[]).length,
    `outcomeStats.sampleTooSmall (${os.sampleTooSmall}) と sampleSmallItems.length が一致しない`);
  for (const s of os.sampleSmallItems as Array<Record<string, unknown>>) {
    assert(typeof s.code === "string", "sampleSmallItem.code は string");
    assert(typeof s.name === "string", "sampleSmallItem.name は string");
    assert(typeof s.sampleSize === "number", "sampleSmallItem.sampleSize は number");
  }
}

// 8) mixedOutcomes
assert(isObject(reportData.mixedOutcomes), "mixedOutcomes は object");
{
  const m = reportData.mixedOutcomes as Record<string, unknown>;
  assert(typeof m.count === "number", "mixedOutcomes.count は number");
  assert(Array.isArray(m.items), "mixedOutcomes.items は配列");
  assert(typeof m.note === "string", "mixedOutcomes.note は string");
  assert(m.count === (m.items as unknown[]).length,
    `mixedOutcomes.count (${m.count}) と items.length が一致しない`);
  for (const item of m.items as Array<Record<string, unknown>>) {
    assert(typeof item.code === "string", "mixedItem.code は string");
    assert(typeof item.specialCount === "number", "mixedItem.specialCount は number");
    assert(typeof item.normalCount === "number", "mixedItem.normalCount は number");
    assert(item.specialCount > 0, `mixedItem.specialCount は1以上 (code=${item.code})`);
    assert(item.normalCount > 0, `mixedItem.normalCount は1以上 (code=${item.code})`);
  }
}

// 9) actionItems の構造
const ALLOWED_PRIORITIES = new Set(["urgent", "attention", "info", "ok"]);
const ALLOWED_CATEGORIES = new Set(["seed", "backfill", "review", "data", "health"]);
assert(reportData.actionItems.length > 0, "actionItems は1件以上必要");
for (const item of reportData.actionItems as Array<Record<string, unknown>>) {
  assert(ALLOWED_PRIORITIES.has(item.priority as string), `不正な priority: ${item.priority}`);
  assert(ALLOWED_CATEGORIES.has(item.category as string), `不正な category: ${item.category}`);
  assert(typeof item.title === "string" && item.title.length > 0, "actionItem.title は非空 string");
  assert(typeof item.detail === "string" && item.detail.length > 0, "actionItem.detail は非空 string");
  if (item.command !== undefined) {
    assert(typeof item.command === "string", "actionItem.command は string");
  }
}

// 10) healthStatus と actionItems の整合性チェック
{
  const priorities = (reportData.actionItems as Array<Record<string, unknown>>).map(i => i.priority);
  if (priorities.includes("urgent")) {
    assert(reportData.healthStatus === "action_required",
      "urgent な actionItem があれば healthStatus は action_required");
  } else if (priorities.includes("attention")) {
    assert(reportData.healthStatus === "needs_attention" || reportData.healthStatus === "action_required",
      "attention な actionItem があれば healthStatus は needs_attention 以上");
  }
  // historical_seed_overdue のみ（info 扱い）の場合、action_required にならないことを確認
  const rd = reportData.reviewDue as Record<string, unknown>;
  const recentOverdue = rd.overdue as number;
  const historicalOverdue = rd.historicalSeedOverdue as number;
  if (recentOverdue === 0 && historicalOverdue > 0 && (rd.dueToday as number) === 0) {
    assert(reportData.healthStatus !== "action_required",
      "recent overdue が0 かつ historical_seed_overdue のみの場合は action_required にならない");
  }
}

// 11) Markdown レポートが生成されている
assert(existsSync("reports/special_situation_ops_summary_latest.md"),
  "reports/special_situation_ops_summary_latest.md は必ず生成される必要があります");

// 12) notes に免責事項
assert(
  (reportData.notes as string[]).some(n => n.includes("売買推奨ではありません")),
  "notes に「売買推奨ではありません」が含まれる"
);

// 13) 禁止文言テスト
const text = JSON.stringify(reportData) + "\n" + (existsSync("reports/special_situation_ops_summary_latest.md")
  ? readFileSync("reports/special_situation_ops_summary_latest.md", "utf-8")
  : "");
for (const forbidden of ["買うべき", "売るべき", "必ず上がる", "確実に上がる", "推奨銘柄"]) {
  assert(!text.includes(forbidden), `禁止文言「${forbidden}」を含めない`);
}

// 14) totalCandidates > 0
assert((reportData.coverage as Record<string, unknown>).totalCandidates as number > 0,
  "totalCandidates は1以上必要");

console.log("special-situation-ops-summary.test.ts passed");
