import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type StockDetailModule = {
  normalizeStockDetail: (raw: { code: string; data: any; ops?: any; outcomeQuality?: any }) => any;
  loadOpsDashboard: () => any;
  loadOutcomeQualityAudit: () => any;
};

type DetailSignal = {
  status: string;
  title: string;
};

const {
  normalizeStockDetail,
  loadOpsDashboard,
  loadOutcomeQualityAudit,
} = await (0, eval)('import("../apps/web/lib/stock-detail.js")') as StockDetailModule;

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-06-11",
    headline: "alpha-pon",
    summary: { strategic: "", pipeline: "", committee: "", roadmap: [], refresh: [] },
    reports: [],
    candidates: [
      {
        code: "8136",
        name: "サンリオ",
        market: "TSE",
        status: "watch",
        priority: "B",
        tags: ["character"],
        price: null,
        changePct: null,
        drawdownPct: null,
        score: {
          structuralEvent: 10,
          supplyDemand: 10,
          valuation: 10,
          theme: 10,
          businessSafety: 10,
          aiReview: 10,
        },
        reasons: ["決算後の確認対象"],
        negativeReasons: ["期待先行の確認"],
        nextToSee: ["決算資料"],
        triggeredRule: "quality_check",
        lastNotifiedAt: "2026-06-11",
      },
    ],
    universeCandidates: [],
    universeScan: null,
    hypothesisPredictions: [],
    hypothesisOutcomes: [],
    generatedCompanyRules: [],
    positions: [],
    accuracySummary: null,
    worldContext: null,
    companyMemory: [],
    companyMemoryByCode: {},
    primaryDisclosureReviews: {},
    dataQualityByCode: {},
    runCursors: {},
    readiness: null,
    ipoThemeWatch: null,
    specialSituationWatch: null,
    specialSituationOps: null,
    hypothesisOutcomeIntegrity: null,
    meta: null,
    ...overrides,
  } as any;
}

function hypothesis(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    code: "8136",
    name: "サンリオ",
    detectedAt: "2026-06-01",
    reviewDueAt: "2026-07-01",
    reason: "確認対象",
    expectedTimeframe: "1m",
    expectedDirection: "unknown",
    confidence: 0.5,
    invalidationSignals: ["下方修正"],
    evidenceNeeded: ["一次情報"],
    relatedWorldEventIds: [],
    relatedDisclosureIds: [],
    status: "open",
    label: "検証候補",
    ...overrides,
  };
}

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    code: "8136",
    name: "サンリオ",
    hypothesis: hypothesis(),
    evaluatedAt: "2026-06-02",
    reviewHorizon: "1d",
    actionLabel: "log",
    scoreAtPrediction: 60,
    startPrice: 1000,
    endPrice1d: null,
    endPrice1w: null,
    endPrice1m: null,
    endPrice3m: null,
    return1d: null,
    return1w: null,
    return1m: null,
    return3m: null,
    topixReturn1d: null,
    benchmarkReturn1w: null,
    benchmarkReturn3m: null,
    topixReturn1m: null,
    relativeToTopix1d: null,
    relativeToTopix1w: null,
    relativeToTopix1m: null,
    relativeToTopix3m: null,
    maxDrawdownPct: null,
    actualDirection: "unknown",
    result: "unknown",
    dataAvailability: "ok",
    whatMatched: [],
    whatDiffered: [],
    missedSignals: [],
    improvedRuleIdeas: [],
    notes: "",
    dataSource: "jquants",
    ...overrides,
  };
}

{
  const detail = normalizeStockDetail({ code: "8136", data: baseData() });
  assert.ok(detail);
  assert.equal(detail.code, "8136");
  assert.equal(detail.name, "サンリオ");
  assert.equal(detail.score, 60);
  console.log("stock-detail: 既存 code の detail を構築");
}

{
  const detail = normalizeStockDetail({ code: "9999", data: baseData() });
  assert.equal(detail, null);
  console.log("stock-detail: 存在しない code は null");
}

{
  const detail = normalizeStockDetail({
    code: "8136",
    data: baseData({ hypothesisPredictions: [hypothesis()], hypothesisOutcomes: [] }),
  });
  assert.ok(detail);
  assert.equal(detail.outcomes.length, 0);
  assert.equal(detail.hypotheses.length, 1);
  console.log("stock-detail: outcome なしでも落ちない");
}

{
  const detail = normalizeStockDetail({
    code: "8136",
    data: baseData({ hypothesisOutcomes: [outcome({ result: null })] }),
  });
  assert.ok(detail);
  assert.equal(detail.outcomes[0].resultLabel, "未評価");
  assert.equal(detail.outcomes[0].status, "missing");
  console.log("stock-detail: result=null を未評価として扱う");
}

{
  const detail = normalizeStockDetail({
    code: "8136",
    data: baseData({ hypothesisOutcomes: [outcome({ dataAvailability: "partial", result: "hit" })] }),
  });
  assert.ok(detail);
  assert.equal(detail.outcomes[0].resultLabel, "未評価: 価格データ不足");
  assert.equal(detail.outcomes[0].status, "info");
  console.log("stock-detail: dataAvailability != ok を未評価として扱う");
}

{
  const detail = normalizeStockDetail({
    code: "8136",
    data: baseData({
      hypothesisOutcomes: [
        outcome({
          result: "hit",
          dataAvailability: "ok",
          actualDirection: "unknown",
          hypothesis: hypothesis({ expectedDirection: "unknown" }),
        }),
      ],
    }),
  });
  assert.ok(detail);
  assert.equal(detail.outcomes[0].resultLabel, "未評価: 方向未確定");
  assert.equal(detail.outcomes[0].status, "missing");
  console.log("stock-detail: unknown 同士を仮説整合にしない");
}

{
  const detail = normalizeStockDetail({
    code: "8136",
    data: baseData({ hypothesisOutcomes: [outcome({ dataAvailability: "missing", result: "unknown" })] }),
    ops: { allIssues: [{ severity: "info", title: "価格データ提供待ち: 1件", detail: "8136 は提供待ち" }] },
  });
  assert.ok(detail);
  assert.equal(detail.priceDataPending, true);
  assert.equal(detail.outcomes[0].dataAvailability, "priceDataPending");
  assert.ok(detail.opsSignals.some((signal: DetailSignal) => signal.status === "info" && signal.title.includes("価格データ提供待ち")));
  console.log("stock-detail: priceDataPending を info として扱う");
}

{
  const originalCwd = process.cwd();
  const emptyDir = mkdtempSync(join(tmpdir(), "alpha-pon-stock-detail-"));
  try {
    process.chdir(emptyDir);
    assert.equal(loadOpsDashboard(), null);
    assert.equal(loadOutcomeQualityAudit(), null);
    const detail = normalizeStockDetail({ code: "8136", data: baseData(), ops: loadOpsDashboard(), outcomeQuality: loadOutcomeQualityAudit() });
    assert.ok(detail);
    assert.equal(detail.opsSignals.length, 0);
  } finally {
    process.chdir(originalCwd);
  }
  console.log("stock-detail: ops/audit JSON 未生成でも落ちない");
}
