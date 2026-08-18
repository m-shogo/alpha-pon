import assert from "node:assert/strict";
import { validateThemesConfig } from "../src/config.js";
import { scoreHealthyPullback } from "../src/score/pullback.js";
import { scoreEarningsDrop } from "../src/score/earnings.js";
import { validateWatchlist } from "../src/validation.js";
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
  console.log("score.test.ts passed");
}

main();