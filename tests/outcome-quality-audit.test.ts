// 仮説レビュー品質監査 v1 のテスト
// pnpm test で自動実行される

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

{
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

  const fresh = buildOutcomeQualityAudit(
    inputs({ hypotheses: [hypothesis({ detectedAt: "2026-06-10" })], outcomes: [] })
  );
  assert.equal(fresh.checks.reviewMissing.count, 0);
  console.log("outcome-quality: 未レビュー仮説を検出（期日前は除外）");
}

{
  const audit = buildOutcomeQualityAudit(
    inputs({ outcomes: [outcome({ reviewHorizon: "1d" })] })
  );
  assert.equal(audit.checks.horizonGaps.count, 1);
  assert.ok(audit.checks.horizonGaps.items[0].detail.includes("1w"));
  assert.ok(!audit.checks.horizonGaps.items[0].detail.includes("1m"), "未到来の 1m は要求しない");
  console.log("outcome-quality: horizon 記録欠けを検出（未到来分は除外）");
}

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

{
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

  const valid = buildOutcomeQualityAudit(
    inputs({
      hypotheses: [hypothesis({ detectedAt: "2026-06-01", reviewDueAt: "2026-07-01", expectedTimeframe: "1m" })],
      outcomes: [outcome({ reviewHorizon: "1d" }), outcome({ reviewHorizon: "1w" })],
    })
  );
  assert.equal(valid.checks.dueAtMismatch.count, 0);
  console.log("outcome-quality: reviewDueAt のズレを検出");
}

{
  const invalidDetectedAt = buildOutcomeQualityAudit(inputs({
    hypotheses: [hypothesis({ code: "9998", detectedAt: "2026-02-31" })],
    outcomes: [],
  }));
  assert.equal(invalidDetectedAt.checks.reviewMissing.count, 0);
  assert.equal(invalidDetectedAt.checks.dueAtMismatch.count, 1);
  assert.equal(invalidDetectedAt.healthStatus, "needs_attention");

  const invalidReviewDueAt = buildOutcomeQualityAudit(inputs({
    hypotheses: [hypothesis({
      detectedAt: "2026-02-28",
      reviewDueAt: "2026-02-31",
      expectedTimeframe: "1d",
    })],
    outcomes: [outcome({ reviewHorizon: "1d" }), outcome({ reviewHorizon: "1w" })],
  }));
  assert.equal(invalidReviewDueAt.checks.dueAtMismatch.count, 1);
  assert.ok(invalidReviewDueAt.checks.dueAtMismatch.items[0].detail.includes("実在する YYYY-MM-DD"));

  const invalidToday = buildOutcomeQualityAudit(inputs({
    today: "2026-02-31",
    hypotheses: [hypothesis({ code: "9997", detectedAt: "2026-02-01" })],
    outcomes: [],
  }));
  assert.equal(invalidToday.checks.reviewMissing.count, 0);
  console.log("outcome-quality: 非実在Gregorian日付を正規化せずfail closed / 可視化 OK");
}

{
  const audit = buildOutcomeQualityAudit(inputs({ outcomes: [] , hypotheses: [hypothesis()] }));
  const md = renderOutcomeQualityMarkdown(audit);
  assert.ok(md.includes("仮説レビュー品質監査"));
  assert.ok(md.includes("未レビュー仮説"));
  assert.ok(md.includes("売買を推奨しない"));
  console.log("outcome-quality: Markdown 出力 OK");
}

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

  const withoutQuality = buildOpsDashboard({ ...base, outcomeQuality: null });
  assert.equal(withoutQuality.healthStatus, "ok");
  assert.ok(withoutQuality.allIssues.some(issue => issue.category === "outcome_quality" && issue.severity === "info"));
  console.log("outcome-quality: ops dashboard 統合 OK");
}

{
  const source = readFileSync(new URL("../src/outcome-quality-audit-report.ts", import.meta.url), "utf-8");
  assert.match(source, /Array\.isArray\(hypotheses\)/, "hypotheses root shape must fail closed");
  assert.match(source, /Array\.isArray\(outcomes\)/, "outcomes root shape must fail closed");
  assert.ok(!source.includes("hypothesesFile.hypotheses ?? []"), "malformed hypotheses shape must not degrade to empty-ok");
  assert.ok(!source.includes("outcomesFile.outcomes ?? []"), "malformed outcomes shape must not degrade to empty-ok");
  assert.match(source, /hypotheses\.every\(isQualityHypothesisLike\)/, "malformed hypothesis rows must fail closed before audit logic");
  assert.match(source, /outcomes\.every\(isQualityOutcomeLike\)/, "malformed outcome rows must fail closed before audit logic");
  assert.match(source, /isOptionalStringArray\(value\.whatMatched\)/, "whatMatched must be validated as a string array");
  assert.match(source, /isOptionalStringArray\(value\.missedSignals\)/, "missedSignals must be validated as a string array");
  console.log("outcome-quality: malformed generated input root/row shape fails closed");
}

console.log("outcome-quality-audit: 全テスト成功");
