import assert from "node:assert/strict";
import { validateThemesConfig } from "../src/config.js";
import { scoreHealthyPullback } from "../src/score/pullback.js";
import { scoreEarningsDrop } from "../src/score/earnings.js";
import { validateWatchlist } from "../src/validation.js";
import { parseLearningScoreInput } from "../src/learning-score-input.js";
import { normalizePrimaryDisclosureLearningScoreInput } from "../src/primary-disclosure-learning-input.js";
import { parseHypothesisOutcomesJsonl } from "../src/hypothesis-outcome-input.js";
import type { WatchlistConfig } from "../src/types.js";
import {
  isGeneratedPipelineStatusInput,
  isGeneratedReportInput,
  isGeneratedRunCursorState,
  isGeneratedWorldThemeCandidateHypothesisInput,
  normalizeGeneratedWarningsInput,
} from "../apps/web/lib/generated-array-input.js";

function testPullbackMissingFinancials() {
  const result = scoreHealthyPullback({
    drawdownPct: -20,
    revenueYoY: null,
    operatingProfitYoY: null,
    hasDownwardRevision: null,
    hasStrategicTheme: true,
  });

  assert.equal(result.score, 11);
  assert.ok(result.negativeReasons.includes("売上前年比データなし"));
  assert.ok(result.negativeReasons.includes("営業利益前年比データなし"));
  assert.ok(result.negativeReasons.includes("下方修正有無のデータなし"));
}

function testEarningsDropMissingFinancials() {
  const result = scoreEarningsDrop({
    nextDayChangePct: null,
    hasDownwardRevision: null,
    revenueYoY: null,
    operatingProfitYoY: null,
    hasStrategicTheme: true,
  });

  assert.equal(result.score, 6);
  assert.ok(result.negativeReasons.includes("決算翌日の株価変化データなし"));
  assert.ok(result.negativeReasons.includes("売上前年比データなし"));
  assert.ok(result.negativeReasons.includes("営業利益前年比データなし"));
}

function testMalformedWatchlistRowsFailClosed() {
  const config = {
    symbols: [
      null,
      "broken",
      {
        code: "8136",
        name: "サンリオ",
        market: "TSE",
        status: "research",
        priority: "S",
        tags: ["entertainment"],
        rules: ["healthy_pullback"],
      },
    ],
  } as unknown as WatchlistConfig;

  const errors = validateWatchlist(config);
  assert.ok(errors.some(error => error.includes("symbols[0]: 銘柄rowはobjectにしてください")));
  assert.ok(errors.some(error => error.includes("symbols[1]: 銘柄rowはobjectにしてください")));
  assert.equal(errors.some(error => error.includes("8136 サンリオ")), false, "正常rowは壊れrowの周囲でも維持する");
}

function testCanonicalWatchlistCodeIdentity() {
  const config = {
    symbols: [
      {
        code: "8136",
        name: "サンリオ",
        market: "TSE",
        status: "research",
        priority: "S",
        tags: ["entertainment"],
        rules: ["healthy_pullback"],
      },
      {
        code: " 8136 ",
        name: "duplicate",
        market: "TSE",
        status: "watch",
        priority: "A",
        tags: ["entertainment"],
        rules: ["healthy_pullback"],
      },
    ],
  } as unknown as WatchlistConfig;

  const errors = validateWatchlist(config);
  assert.ok(errors.some(error => error.includes("canonical identity")), "padded codeは拒否する");
  assert.ok(errors.some(error => error.includes("銘柄コード重複: 8136")), "trim後の同一identityを重複として検出する");
}

function testMalformedThemeConfigFailsClosed() {
  assert.throws(() => validateThemesConfig({ themes: null }), /themes object is required/);
  assert.throws(() => validateThemesConfig({ themes: { ai: "broken" } }), /ai must be an object/);
  assert.throws(
    () => validateThemesConfig({ themes: { ai: { label: "AI", score: "5" } } }),
    /ai\.score must be a finite number/,
  );
  assert.deepEqual(validateThemesConfig({ themes: { ai: { label: "AI", score: 5 } } }), {
    themes: { ai: { label: "AI", score: 5 } },
  });
}

function testGeneratedRunCursorShape() {
  assert.equal(isGeneratedRunCursorState({ jobName: "jquants", offset: 3, total: 10 }), true);
  assert.equal(isGeneratedRunCursorState(null), false);
  assert.equal(isGeneratedRunCursorState({ offset: "3", total: 10 }), false);
  assert.equal(isGeneratedRunCursorState({ offset: Number.NaN, total: 10 }), false);
}

function testGeneratedReportShape() {
  const valid = { key: "daily", label: "Daily", path: "reports/latest.md", available: true, excerpt: ["ok"] };
  assert.equal(isGeneratedReportInput(valid), true);
  assert.equal(isGeneratedReportInput(null), false);
  assert.equal(isGeneratedReportInput({ ...valid, available: "yes" }), false);
  assert.equal(isGeneratedReportInput({ ...valid, excerpt: {} }), false);
}

function testGeneratedWarningsShape() {
  assert.deepEqual(normalizeGeneratedWarningsInput(["ok"]), { warnings: ["ok"], warning: null });
  assert.deepEqual(normalizeGeneratedWarningsInput("broken"), {
    warnings: [],
    warning: "meta.warnings: invalid_root (expected string array)",
  });
  assert.deepEqual(normalizeGeneratedWarningsInput(["ok", null, 42]), {
    warnings: ["ok"],
    warning: "meta.warnings: invalid_entries (2)",
  });
}

function testGeneratedWorldThemeCandidateHypothesisShape() {
  const valid = {
    sourceEventTitle: "event",
    sourceEventPublishedAt: "2026-08-17",
    theme: "theme",
    candidateCode: "8136",
    candidateCompany: "Sanrio",
    whyThisCompany: "why",
    upsideHypothesis: "up",
    downsideRisk: "down",
    nextPrimaryCheck: "check",
    reviewAfterDays: [30, 90, 180],
    disclaimer: "not advice",
  };
  assert.equal(isGeneratedWorldThemeCandidateHypothesisInput(valid), true);
  assert.equal(isGeneratedWorldThemeCandidateHypothesisInput(null), false);
  assert.equal(isGeneratedWorldThemeCandidateHypothesisInput({ ...valid, candidateCode: undefined }), false);
  assert.equal(isGeneratedWorldThemeCandidateHypothesisInput({ ...valid, reviewAfterDays: [30, 90] }), false);
}

function testGeneratedPipelineStatusShape() {
  assert.equal(isGeneratedPipelineStatusInput({
    status: "failed",
    completeWrapperFailedSteps: ["fetch:jquants"],
    endedAt: "2026-08-17T19:00:00Z",
  }), true);
  assert.equal(isGeneratedPipelineStatusInput(null), false);
  assert.equal(isGeneratedPipelineStatusInput("failed"), false);
  assert.equal(isGeneratedPipelineStatusInput({ completeWrapperFailedSteps: "fetch:jquants" }), false);
  assert.equal(isGeneratedPipelineStatusInput({ completeWrapperFailedSteps: ["ok", null] }), false);
}

function testLearningScoreInputIsolation() {
  const valid = {
    code: "8136",
    name: "サンリオ",
    score: 72,
    alertLevel: "daily",
    createdAt: "2026-08-21",
    warnings: ["ok"],
    riskReview: { decision: "watch", blockers: [] },
    expertReview: {
      finalVerdict: "caution",
      disagreements: ["valuation"],
      lenses: [{ name: "quality", verdict: "caution", nextChecks: ["IR"] }],
    },
  };
  const parsed = parseLearningScoreInput(JSON.stringify([
    valid,
    null,
    { ...valid, code: "4661", warnings: {} },
    { ...valid, code: "7832", score: "72" },
  ]), "2026-08-21");
  assert.ok(parsed);
  assert.deepEqual(parsed.entries.map(entry => entry.code), ["8136"], "正常rowは壊れrowの周囲でも維持する");
  assert.deepEqual(parsed.invalidRows, [2, 3, 4], "crashし得る壊れrowは行単位で隔離する");
  assert.equal(parseLearningScoreInput(JSON.stringify({ code: "8136" }), "2026-08-21"), null, "object rootをscore arrayとして扱わない");
  assert.equal(parseLearningScoreInput("{broken", "2026-08-21"), null, "壊れJSONをscore arrayとして扱わない");
}

function testLearningScorePitCutoff() {
  const parsed = parseLearningScoreInput(JSON.stringify([{
    code: "8136",
    name: "サンリオ",
    score: 72,
    alertLevel: "daily",
    createdAt: "2026-08-22",
  }]), "2026-08-21");
  assert.ok(parsed);
  assert.equal(parsed.entries.length, 0, "未来日のscore rowを現在のlearning evidenceへ混入させない");
  assert.deepEqual(parsed.invalidRows, [1]);
  assert.equal(parseLearningScoreInput("[]", "2026-02-31"), null, "不存在asOfをPIT cutoffとして使わない");
}

function testLearningScoreDuplicateIdentity() {
  const base = {
    code: "8136",
    name: "サンリオ",
    score: 72,
    alertLevel: "daily",
    createdAt: "2026-08-21",
  };
  const parsed = parseLearningScoreInput(JSON.stringify([
    base,
    { ...base, score: 90 },
    { ...base, code: "4661", name: "別銘柄" },
  ]), "2026-08-21");
  assert.ok(parsed);
  assert.deepEqual(parsed.entries.map(entry => entry.code), ["4661"], "重複learning identityを入力順で正本化しない");
  assert.deepEqual(parsed.invalidRows, [1, 2], "重複identity参加rowは全件隔離する");
}

function testLearningAlertLevelContract() {
  const parsed = parseLearningScoreInput(JSON.stringify([{
    code: "8136",
    name: "サンリオ",
    score: 72,
    alertLevel: "later",
    createdAt: "2026-08-21",
  }]), "2026-08-21");
  assert.ok(parsed);
  assert.equal(parsed.entries.length, 0, "producer契約外alertLevelを総件数だけ増えるlearning evidenceにしない");
  assert.deepEqual(parsed.invalidRows, [1]);
}

function testPrimaryDisclosureLearningStringIdentity() {
  const normalized = normalizePrimaryDisclosureLearningScoreInput([{
    code: "8136",
    name: "サンリオ",
    score: 80,
    alertLevel: "watch",
    createdAt: "2026-08-21",
    primaryDisclosureReview: {
      decision: "confirmed",
      positives: ["official IR", " official IR "],
      warnings: ["timing", "timing "],
      blockers: ["dilution", " dilution"],
    },
  }], "scores_2026-08-21.json", "2026-08-21");

  const review = normalized.rows[0]?.primaryDisclosureReview;
  assert.deepEqual(review?.positives, ["official IR"], "padded positive Evidenceを別frequency bucketにしない");
  assert.deepEqual(review?.warnings, ["timing"], "padded warning Evidenceを別frequency bucketにしない");
  assert.deepEqual(review?.blockers, ["dilution"], "padded blocker Evidenceを別frequency bucketにしない");
  assert.equal(
    normalized.warnings.filter(warning => warning.endsWith("invalid_item")).length,
    3,
    "padded learning Evidenceはmetadata warning付きで隔離する",
  );
}

function testHypothesisOutcomeReviewHorizonContract() {
  const base = {
    code: "8136",
    hypothesis: { detectedAt: "2026-08-21" },
    reviewHorizon: "1w",
    actionLabel: "log",
    result: "unknown",
  };
  const parsed = parseHypothesisOutcomesJsonl([
    JSON.stringify(base),
    JSON.stringify({ ...base, code: "4661", reviewHorizon: "2w" }),
    JSON.stringify({ ...base, code: "7832", reviewHorizon: " 1w " }),
    JSON.stringify({ ...base, code: "7974", reviewHorizon: undefined }),
  ].join("\n"), "synthetic outcomes");
  assert.deepEqual(parsed.rows.map(row => row.code), ["8136"], "canonical reviewHorizonだけをdue/review evidenceへ残す");
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /3 malformed JSONL row\(s\) isolated/);
}

function testHypothesisOutcomeActionLabelContract() {
  const base = {
    code: "8136",
    hypothesis: { detectedAt: "2026-08-21" },
    reviewHorizon: "1w",
    actionLabel: "log",
    result: "unknown",
  };
  const parsed = parseHypothesisOutcomesJsonl([
    JSON.stringify(base),
    JSON.stringify({ ...base, code: "4661", actionLabel: "buy" }),
    JSON.stringify({ ...base, code: "7832", actionLabel: " log " }),
    JSON.stringify({ ...base, code: "7974", actionLabel: undefined }),
  ].join("\n"), "synthetic outcomes");
  assert.deepEqual(parsed.rows.map(row => row.code), ["8136", "7974"], "未知・padded actionLabelだけをaccuracy evidenceから隔離し、legacy欠落rowは維持する");
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /2 malformed JSONL row\(s\) isolated/);
}

function main() {
  testPullbackMissingFinancials();
  testEarningsDropMissingFinancials();
  testMalformedWatchlistRowsFailClosed();
  testCanonicalWatchlistCodeIdentity();
  testMalformedThemeConfigFailsClosed();
  testGeneratedRunCursorShape();
  testGeneratedReportShape();
  testGeneratedWarningsShape();
  testGeneratedWorldThemeCandidateHypothesisShape();
  testGeneratedPipelineStatusShape();
  testLearningScoreInputIsolation();
  testLearningScorePitCutoff();
  testLearningScoreDuplicateIdentity();
  testLearningAlertLevelContract();
  testPrimaryDisclosureLearningStringIdentity();
  testHypothesisOutcomeReviewHorizonContract();
  testHypothesisOutcomeActionLabelContract();
  console.log("score.test.ts passed");
}

main();