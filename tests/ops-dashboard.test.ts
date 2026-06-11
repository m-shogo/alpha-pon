// ops-dashboard（運用司令塔 v1）のテスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import {
  buildOpsDashboard,
  findForbiddenWording,
  maskPattern,
  OPS_FORBIDDEN_PATTERNS,
  type OpsDashboardInputs,
} from "../src/ops-dashboard.js";

const TODAY = "2026-06-11";

function cleanInputs(): OpsDashboardInputs {
  return {
    today: TODAY,
    pipelineStatus: {
      date: TODAY,
      status: "completed",
      failedSteps: "",
      steps: [{ name: "daily", status: "ok" }],
    },
    alphaData: {
      generatedAt: TODAY,
      meta: { warnings: [] },
      universeScan: { scanStatus: "ok", fallbackReason: null },
      dataQualityByCode: {
        "8136": { quality: { level: "ok" }, warnings: [] },
      },
    },
    outcomes: [
      { code: "8136", reviewHorizon: "1d", result: "hit", dataAvailability: "ok" },
    ],
    specialOps: {
      healthStatus: "ok",
      actionItems: [],
      reviewDue: { overdue: 0, historicalSeedOverdue: 0, dueToday: 0, dueThisWeek: 0 },
    },
    integrity: { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
    outcomeQuality: { healthStatus: "ok", checks: {} },
    safeWordingScannedFiles: 10,
    safeWordingFindings: [],
  };
}

// ── schema / クリーン状態 ────────────────────────────────────

{
  const dashboard = buildOpsDashboard(cleanInputs());
  assert.equal(dashboard.schemaVersion, 1);
  assert.equal(dashboard.generatedAt, TODAY);
  assert.equal(dashboard.healthStatus, "ok");
  assert.deepEqual(dashboard.priorityIssues, []);
  for (const key of [
    "outcomeAudit",
    "staleFallbackAudit",
    "dataAvailabilityAudit",
    "safeWordingAudit",
    "pipelineAudit",
    "uiDataAudit",
    "specialSituationAudit",
    "nextSafeCommands",
    "notes",
  ] as const) {
    assert.ok(key in dashboard, `schema に ${key} がある`);
  }
  assert.ok(dashboard.nextSafeCommands.some(c => c.command === "pnpm health"));
  assert.ok(dashboard.notes.length > 0);
  console.log("ops-dashboard: クリーン状態で healthStatus=ok / schema OK");
}

// ── pipeline 失敗 → action_required ──────────────────────────

{
  const inputs = cleanInputs();
  inputs.pipelineStatus = {
    date: TODAY,
    status: "failed",
    failedSteps: "daily",
    steps: [{ name: "daily", status: "failed" }],
  };
  const dashboard = buildOpsDashboard(inputs);
  assert.equal(dashboard.healthStatus, "action_required");
  assert.equal(dashboard.priorityIssues[0].severity, "urgent");
  assert.equal(dashboard.priorityIssues[0].category, "pipeline");
  assert.deepEqual(dashboard.pipelineAudit.failedSteps, ["daily"]);
  assert.ok(dashboard.nextSafeCommands.some(c => c.command === "pnpm daily"));
  console.log("ops-dashboard: pipeline 失敗で action_required");
}

// ── dataAvailability != ok の outcome 判定を確認対象にする ──

{
  const inputs = cleanInputs();
  inputs.outcomes = [
    { code: "7011", reviewHorizon: "1d", result: "hit", dataAvailability: "partial" },
    { code: "8035", reviewHorizon: "1w", result: "miss", dataAvailability: "none" },
    { code: "8136", reviewHorizon: "1m", result: "too_early", dataAvailability: "partial" },
  ];
  const dashboard = buildOpsDashboard(inputs);
  assert.equal(dashboard.outcomeAudit.judgedWithLimitedData.length, 2, "hit/miss のみ確認対象");
  assert.deepEqual(
    dashboard.outcomeAudit.judgedWithLimitedData.map(item => item.code),
    ["7011", "8035"]
  );
  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(dashboard.allIssues.some(issue => issue.category === "data_availability" && issue.severity === "attention"));
  console.log("ops-dashboard: データ不足のまま判定済み outcome を検出");
}

// ── stale fallback / warning 重複の検出 ──────────────────────

{
  const inputs = cleanInputs();
  inputs.alphaData = {
    generatedAt: TODAY,
    meta: { warnings: [] },
    universeScan: { scanStatus: "stale_fallback", fallbackReason: "前回スキャン結果を再利用" },
    dataQualityByCode: {
      "8136": { quality: { level: "partial" }, warnings: ["W1", "W2", "W1"] },
      "7011": { quality: { level: "ok" }, warnings: ["W3"] },
    },
  };
  const dashboard = buildOpsDashboard(inputs);
  assert.equal(dashboard.staleFallbackAudit.duplicatedWarningCodes.length, 1);
  assert.equal(dashboard.staleFallbackAudit.duplicatedWarningCodes[0].code, "8136");
  assert.deepEqual(dashboard.staleFallbackAudit.duplicatedWarningCodes[0].duplicatedWarnings, ["W1"]);
  assert.equal(dashboard.staleFallbackAudit.universeFallbackReason, "前回スキャン結果を再利用");
  assert.ok(dashboard.allIssues.some(issue => issue.category === "stale_fallback"));
  assert.equal(dashboard.healthStatus, "needs_attention");
  console.log("ops-dashboard: stale fallback と warning 重複を検出");
}

// ── UI データ stale → needs_attention ────────────────────────

{
  const inputs = cleanInputs();
  inputs.alphaData = { ...inputs.alphaData, generatedAt: "2026-06-10" };
  const dashboard = buildOpsDashboard(inputs);
  assert.equal(dashboard.uiDataAudit.isToday, false);
  assert.equal(dashboard.healthStatus, "needs_attention");
  assert.ok(dashboard.nextSafeCommands.some(c => c.command === "pnpm ui:data"));
  console.log("ops-dashboard: UI 生成データの stale を検出");
}

// ── 安全表現チェック ─────────────────────────────────────────

{
  const forbidden = OPS_FORBIDDEN_PATTERNS[0];
  const allowed = ["買い推奨ではな", "い"].join("");
  const content = [`今日の${forbidden}はこちら`, `この情報は${allowed}`, "調査候補として保留"].join("\n");
  const findings = findForbiddenWording(content, "reports/sample_latest.md");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 1);
  assert.equal(findings[0].maskedPattern, maskPattern(forbidden));
  assert.ok(!findings[0].maskedPattern.includes(forbidden), "出力にパターン原文を含めない");

  const inputs = cleanInputs();
  inputs.safeWordingFindings = findings;
  const dashboard = buildOpsDashboard(inputs);
  assert.equal(dashboard.healthStatus, "action_required");
  assert.ok(dashboard.priorityIssues.some(issue => issue.category === "safe_wording" && issue.severity === "urgent"));
  console.log("ops-dashboard: 安全表現違反を検出（マスク済み）");
}

// ── 優先順位: urgent → attention → info、TOP5 まで ───────────

{
  const inputs = cleanInputs();
  inputs.pipelineStatus = { date: TODAY, status: "failed", failedSteps: "daily", steps: [] };
  inputs.alphaData = {
    generatedAt: "2026-06-09",
    meta: { warnings: ["w"] },
    universeScan: { scanStatus: "stale_fallback", fallbackReason: "fallback" },
    dataQualityByCode: {
      "1111": { quality: { level: "partial" }, warnings: ["W1", "W1"] },
    },
  };
  inputs.specialOps = {
    healthStatus: "action_required",
    actionItems: [{ priority: "urgent", title: "未採点", command: "pnpm review:special-due" }],
    reviewDue: { overdue: 3, historicalSeedOverdue: 0, dueToday: 1, dueThisWeek: 4 },
  };
  inputs.outcomes = [{ code: "1111", reviewHorizon: "1d", result: null, dataAvailability: "partial" }];
  const dashboard = buildOpsDashboard(inputs);
  assert.equal(dashboard.healthStatus, "action_required");
  assert.ok(dashboard.priorityIssues.length <= 5);
  assert.equal(dashboard.priorityIssues.length, 5);
  const ranks = dashboard.priorityIssues.map(issue => issue.rank);
  assert.deepEqual(ranks, [1, 2, 3, 4, 5]);
  for (let i = 1; i < dashboard.allIssues.length; i++) {
    const order = { urgent: 0, attention: 1, info: 2 } as const;
    assert.ok(
      order[dashboard.allIssues[i - 1].severity] <= order[dashboard.allIssues[i].severity],
      "severity 降順に並ぶ"
    );
  }
  assert.equal(dashboard.priorityIssues[0].severity, "urgent");
  console.log("ops-dashboard: 優先順位と TOP5 制限 OK");
}

console.log("ops-dashboard: 全テスト成功");
