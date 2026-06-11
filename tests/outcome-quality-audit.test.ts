// 仮説レビュー品質監査 v1 のテスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import {
  buildOutcomeQualityAudit,
  renderOutcomeQualityMarkdown,
  type OutcomeQualityInputs,
  type QualityHypothesisLike,
  type QualityOutcomeLike,
} from "../src/outcome-quality-audit.js";
import { buildOpsDashboard } from "../src/ops-dashboard.js";

const TODAY = "2026-06-11";

function hypothesis(overrides: Partial<QualityHypothesisLike> = {}): QualityHypothesisLike {
  return {
    code: "8136",
    name: "サンリオ",
    detectedAt: "2026-06-01",
    reviewDueAt: "2026-07-01",
    expectedTimeframe: "1m",
    expectedDirection: "up",
    ...overrides,
  };
}

function outcome(overrides: Partial<QualityOutcomeLike> = {}): QualityOutcomeLike {
  return {
    code: "8136",
    name: "サンリオ",
    reviewHorizon: "1d",
    result: "unknown",
    dataAvailability: "ok",
    actualDirection: "unknown",
    whatMatched: [],
    missedSignals: ["メモ"],
    notes: "確認済み",
    hypothesis: hypothesis(),
    ...overrides,
  };
}

function inputs(overrides: Partial<OutcomeQualityInputs> = {}): OutcomeQualityInputs {
  return {
    today: TODAY,
    hypotheses: [hypothesis()],
    outcomes: [outcome()],
    ...overrides,
  };
}

// ── クリーン状態 ─────────────────────────────────────────────

{
  // 1d 記録があり、1w(6/8+猶予3日=6/11到来)も記録済みなら指摘なし
  const audit = buildOutcomeQualityAudit(
    inputs({
      outcomes: [outcome({ reviewHorizon: "1d" }), outcome({ reviewHorizon: "1w" })],
    })
  );
  assert.equal(audit.healthStatus, "ok");
  for (const [key, check] of Object.entries(audit.checks)) {
    assert.equal(check.count, 0, `${key} は 0件`);
  }
  assert.equal(audit.totals.groups, 1);
  console.log("outcome-quality: クリーン状態で healthStatus=ok");
}

// ── 1. detectedAt があるのに review がない ───────────────────

{
  const audit = buildOutcomeQualityAudit(
    inputs({
      hypotheses: [hypothesis({ code: "9999", detectedAt: "2026-06-01" })],
      outcomes: [],
    })
  );
  assert.equal(audit.checks.reviewMissing.count, 1);
  assert.equal(audit.checks.reviewMissing.items[0].code, "9999");
  assert.equal(audit.healthStatus, "needs_attention");

  // 期日前（昨日 detect）は正常待機なので指摘しない
  const fresh = buildOutcomeQualityAudit(
    inputs({ hypotheses: [hypothesis({ detectedAt: "2026-06-10" })], outcomes: [] })
  );
  assert.equal(fresh.checks.reviewMissing.count, 0);
  console.log("outcome-quality: 未レビュー仮説を検出（期日前は除外）");
}

// ── 2. 期日到来 horizon の記録欠け ───────────────────────────

{
  // detectedAt=6/1 → 1d(6/2)+猶予, 1w(6/8)+猶予 は到来済み。1m は未到来。
  const audit = buildOutcomeQualityAudit(
    inputs({ outcomes: [outcome({ reviewHorizon: "1d" })] })
  );
  assert.equal(audit.checks.horizonGaps.count, 1);
  assert.ok(audit.checks.horizonGaps.items[0].detail.includes("1w"));
  assert.ok(!audit.checks.horizonGaps.items[0].detail.includes("1m"), "未到来の 1m は要求しない");
  console.log("outcome-quality: horizon 記録欠けを検出（未到来分は除外）");
}

// ── 3. データ不足のまま判定済み ──────────────────────────────

{
  const audit = buildOutcomeQualityAudit(
    inputs({
      outcomes: [
        outcome({ reviewHorizon: "1d", result: "hit", dataAvailability: "partial" }),
        outcome({ reviewHorizon: "1w", result: "too_early", dataAvailability: "partial" }),
      ],
    })
  );
  assert.equal(audit.checks.judgedWithLimitedData.count, 1, "hit/miss のみ対象");
  console.log("outcome-quality: データ不足のまま判定を検出");
}

// ── 4. unknown 同士の hit 判定 → action_required ─────────────

{
  const audit = buildOutcomeQualityAudit(
    inputs({
      outcomes: [
        outcome({
          reviewHorizon: "1d",
          result: "hit",
          actualDirection: "unknown",
          hypothesis: hypothesis({ expectedDirection: "unknown" }),
        }),
        outcome({ reviewHorizon: "1w" }),
      ],
    })
  );
  assert.equal(audit.checks.unknownMatchedAsHit.count, 1);
  assert.equal(audit.healthStatus, "action_required");

  // 方向が確定している hit は正常
  const valid = buildOutcomeQualityAudit(
    inputs({
      outcomes: [
        outcome({
          reviewHorizon: "1d",
          result: "hit",
          actualDirection: "up",
          hypothesis: hypothesis({ expectedDirection: "up" }),
        }),
        outcome({ reviewHorizon: "1w" }),
      ],
    })
  );
  assert.equal(valid.checks.unknownMatchedAsHit.count, 0);
  console.log("outcome-quality: unknown 同士の hit を検出 → action_required");
}

// ── 5. whatMatched ありなのに未評価 ──────────────────────────

{
  const audit = buildOutcomeQualityAudit(
    inputs({
      outcomes: [
        outcome({ reviewHorizon: "1d", result: "unknown", whatMatched: ["反応あり"] }),
        outcome({ reviewHorizon: "1w" }),
      ],
    })
  );
  assert.equal(audit.checks.pendingWithSignals.count, 1);
  console.log("outcome-quality: whatMatched ありの未評価を検出");
}

// ── 6. 判定済みなのに反省メモ未記入 ──────────────────────────

{
  const audit = buildOutcomeQualityAudit(
    inputs({
      outcomes: [
        outcome({ reviewHorizon: "1d", result: "miss", actualDirection: "down", notes: "", missedSignals: [] }),
        outcome({ reviewHorizon: "1w" }),
      ],
    })
  );
  assert.equal(audit.checks.emptyReviewNotes.count, 1);

  const withNotes = buildOutcomeQualityAudit(
    inputs({
      outcomes: [
        outcome({ reviewHorizon: "1d", result: "miss", actualDirection: "down", notes: "外れた理由メモ" }),
        outcome({ reviewHorizon: "1w" }),
      ],
    })
  );
  assert.equal(withNotes.checks.emptyReviewNotes.count, 0);
  console.log("outcome-quality: 反省メモ未記入を検出");
}

// ── 7. reviewDueAt と expectedTimeframe のズレ ───────────────

{
  // 1w なのに翌日が期限（285A 実例パターン）
  const audit = buildOutcomeQualityAudit(
    inputs({
      hypotheses: [
        hypothesis({ detectedAt: "2024-12-18", reviewDueAt: "2024-12-19", expectedTimeframe: "1w" }),
      ],
      outcomes: [outcome({ reviewHorizon: "1d" }), outcome({ reviewHorizon: "1w" })],
    })
  );
  assert.equal(audit.checks.dueAtMismatch.count, 1);
  assert.ok(audit.checks.dueAtMismatch.items[0].detail.includes("1日"));

  // 1m で 30日後は正常
  const valid = buildOutcomeQualityAudit(
    inputs({
      hypotheses: [hypothesis({ detectedAt: "2026-06-01", reviewDueAt: "2026-07-01", expectedTimeframe: "1m" })],
      outcomes: [outcome({ reviewHorizon: "1d" }), outcome({ reviewHorizon: "1w" })],
    })
  );
  assert.equal(valid.checks.dueAtMismatch.count, 0);
  console.log("outcome-quality: reviewDueAt のズレを検出");
}

// ── Markdown 出力 ────────────────────────────────────────────

{
  const audit = buildOutcomeQualityAudit(inputs({ outcomes: [] , hypotheses: [hypothesis()] }));
  const md = renderOutcomeQualityMarkdown(audit);
  assert.ok(md.includes("仮説レビュー品質監査"));
  assert.ok(md.includes("未レビュー仮説"));
  assert.ok(md.includes("売買を推奨しない"));
  console.log("outcome-quality: Markdown 出力 OK");
}

// ── ops dashboard への統合 ───────────────────────────────────

{
  const base = {
    today: TODAY,
    pipelineStatus: { date: TODAY, status: "completed", failedSteps: "", steps: [] },
    alphaData: { generatedAt: TODAY, meta: { warnings: [] }, universeScan: null, dataQualityByCode: {} },
    outcomes: [],
    specialOps: { healthStatus: "ok", actionItems: [], reviewDue: { overdue: 0, historicalSeedOverdue: 0, dueToday: 0, dueThisWeek: 0 } },
    integrity: { status: "ok", jsonl: { duplicateGroups: [], parseErrors: [] }, sqlite: { duplicateGroups: [] } },
    safeWordingScannedFiles: 0,
    safeWordingFindings: [],
  };

  // unknown hit → urgent / action_required
  const withQuality = buildOpsDashboard({
    ...base,
    outcomeQuality: {
      healthStatus: "action_required",
      checks: { unknownMatchedAsHit: { count: 2 }, emptyReviewNotes: { count: 3 } },
    },
  });
  assert.equal(withQuality.healthStatus, "action_required");
  assert.ok(withQuality.allIssues.some(issue => issue.category === "outcome_quality" && issue.severity === "urgent"));
  assert.ok(withQuality.allIssues.some(issue => issue.category === "outcome_quality" && issue.severity === "attention"));
  assert.equal(withQuality.outcomeQualityAudit.checkCounts["unknownMatchedAsHit"], 2);

  // 未生成 → info のみ（healthStatus は ok のまま）
  const withoutQuality = buildOpsDashboard({ ...base, outcomeQuality: null });
  assert.equal(withoutQuality.healthStatus, "ok");
  assert.ok(withoutQuality.allIssues.some(issue => issue.category === "outcome_quality" && issue.severity === "info"));
  console.log("outcome-quality: ops dashboard 統合 OK");
}

console.log("outcome-quality-audit: 全テスト成功");
