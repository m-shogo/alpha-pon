import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import type { UniverseCandidate, UniverseScanMetadata, UniverseScanOutput, StockCandidateHypothesis, HypothesisOutcome, AccuracySummary, WorldContext } from "./universe.js";
import type { CompanyMemoryRecord } from "./company-memory.js";
import type { PrimaryDisclosureReview } from "./types.js";

type DeepDiveCompany = {
  name: string;
  coverage?: string;
  archetype?: string;
  decisionQuestion?: string;
  currentProvisionalAnswer?: string;
  noMoveReasons?: string[];
  downsideCases?: string[];
  nextDataNeeded?: string[];
  buyTimingFramework?: Record<string, { conditions?: string[]; defaultJudgment?: string }>;
};

type DeepDives = { companies?: Record<string, DeepDiveCompany> };

type LatestScoreEntry = {
  code: string;
  name: string;
  score?: number;
  alertLevel?: string;
  dataQuality?: string;
  reasons?: string[];
  negativeReasons?: string[];
  warnings?: string[];
  nextSteps?: string[];
  primaryDisclosureReview?: PrimaryDisclosureReview;
};

type DataQualityReason =
  | "jquants_delayed"
  | "tdnet_unavailable"
  | "financial_partial"
  | "outcome_insufficient"
  | "price_missing"
  | "news_partial";

type ReadinessReport = {
  generatedAt: string;
  overallScore: number;
  overallStatus: string;
  blockers: string[];
  items: Array<{
    id: string;
    label: string;
    status: string;
    score: number;
    evidence: string[];
    nextActions: string[];
  }>;
};

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function strip(text: string, max = 220): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function section(text: string, title: string, maxLines = 6): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.trim() === `## ${title}`);
  if (start < 0) return [];
  const picked: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    const trimmed = line.trim();
    if (trimmed) picked.push(strip(trimmed, 160));
    if (picked.length >= maxLines) break;
  }
  return picked;
}

function excerpt(text: string, preferredSection: string, fallback = "未生成", maxLines = 8): string[] {
  const fromSection = section(text, preferredSection, maxLines);
  if (fromSection.length > 0) return fromSection;
  const lines = text.split("\n").map(line => strip(line, 160)).filter(Boolean);
  return lines.length > 0 ? lines.slice(0, maxLines) : [fallback];
}

function baseScore(coverage?: string): number {
  if (!coverage) return 56;
  if (coverage.includes("provisional_deep_dive")) return 66;
  if (coverage.includes("deep")) return 70;
  if (coverage.includes("template")) return 58;
  return 56;
}

function toCandidate(code: string, company: DeepDiveCompany, date: string) {
  const score = baseScore(company.coverage);
  const isDeep = company.coverage?.includes("deep") ?? false;
  return {
    code,
    name: company.name,
    market: "TSE",
    status: isDeep ? "research" : "watch",
    priority: isDeep ? "A" : "B",
    tags: [company.archetype ?? "deep-dive", company.coverage ?? "template"],
    rules: ["pro_committee", "deep_dive", "ir_event_check"],
    price: null,
    changePct: null,
    drawdownPct: null,
    score: {
      structuralEvent: Math.min(30, Math.round(score * 0.22)),
      supplyDemand: Math.min(25, Math.round(score * 0.18)),
      valuation: Math.min(15, (company.nextDataNeeded ?? []).some(v => /PER|PBR|バリュエーション/.test(v)) ? 8 : 5),
      theme: 12,
      businessSafety: 7,
      aiReview: 3
    },
    reasons: [
      company.decisionQuestion ?? "Pro会議・深掘り対象",
      ...(company.buyTimingFramework?.afterEarnings?.conditions ?? []).slice(0, 2),
      ...(company.currentProvisionalAnswer ? [company.currentProvisionalAnswer] : [])
    ].filter(Boolean).slice(0, 5),
    negativeReasons: [
      ...(company.noMoveReasons ?? []).slice(0, 3),
      ...(company.downsideCases ?? []).slice(0, 2)
    ],
    nextToSee: (company.nextDataNeeded ?? ["公式IR", "決算資料", "総会/配当/資本政策", "バリュエーション過去レンジ"]).slice(0, 8),
    triggeredRule: "Pro深掘りDB / 重要イベント確認",
    lastNotifiedAt: date,
    sparkline: [100, 99, 101, 98, 97, 99, 100, 98, 99, 97, 98, 99, 100, 99, 98, 99, 100, 101, 100, 99]
  };
}

// ── ユニバース・仮説・検証データ読み込み ────────────────────────

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function loadUniverseScanOutput(): UniverseScanOutput | null {
  const path = "data/universe_candidates_latest.json";
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<UniverseScanOutput> & { candidates?: UniverseCandidate[] };
    const candidates = raw.candidates ?? [];
    return {
      generatedAt: raw.generatedAt ?? "",
      dataSource: raw.dataSource ?? "mock",
      scanStatus: raw.scanStatus ?? (raw.dataSource === "mock" ? "mock" : "fresh"),
      fallbackReason: raw.fallbackReason ?? null,
      count: raw.count ?? candidates.length,
      candidates,
    };
  } catch { return null; }
}

function toUniverseScanMetadata(output: UniverseScanOutput | null): UniverseScanMetadata | null {
  if (!output) return null;
  return {
    generatedAt: output.generatedAt,
    dataSource: output.dataSource,
    scanStatus: output.scanStatus,
    fallbackReason: output.fallbackReason,
    count: output.count,
  };
}

function loadHypotheses(): StockCandidateHypothesis[] {
  return readJsonl<StockCandidateHypothesis>("data/hypothesis_predictions.jsonl");
}

function loadOutcomes(): HypothesisOutcome[] {
  return readJsonl<HypothesisOutcome>("data/hypothesis_outcomes.jsonl");
}

function loadAccuracySummary(): AccuracySummary | null {
  const path = "data/hypothesis_accuracy_summary.json";
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")) as AccuracySummary; } catch { return null; }
}

function loadCompanyMemory(): CompanyMemoryRecord[] {
  const path = "reports/company_memory_latest.json";
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed as CompanyMemoryRecord[] : [];
  } catch { return []; }
}

function loadLatestScores(): LatestScoreEntry[] {
  if (!existsSync("reports")) return [];
  try {
    const scoreFiles = readdirSync("reports")
      .filter((file: string) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .sort();
    const latest = scoreFiles.at(-1);
    if (!latest) return [];
    const parsed = JSON.parse(readFileSync(join("reports", latest), "utf-8"));
    return Array.isArray(parsed) ? parsed as LatestScoreEntry[] : [];
  } catch { return []; }
}

function loadReadiness(): ReadinessReport | null {
  return readJson<ReadinessReport>("reports/readiness_latest.json");
}

function inferDataQualityReasons(score: LatestScoreEntry, outcomes: HypothesisOutcome[]): DataQualityReason[] {
  const text = [...(score.warnings ?? []), ...(score.negativeReasons ?? [])].join(" ");
  const reasons = new Set<DataQualityReason>();
  if (/J-Quants V2|遅延|Freeプラン/.test(text)) reasons.add("jquants_delayed");
  if (/TDnet.*404|TDnet取得失敗|JPX IR News/.test(text)) reasons.add("tdnet_unavailable");
  if (/FCF|財務|営業CF|投資CF|設備投資|データ不足/.test(text)) reasons.add("financial_partial");
  if (/株価データ不足|価格データ不足|prices|daily_quotes|price_missing/.test(text)) reasons.add("price_missing");
  if (/ニュース|RSS|世界イベント|一次情報.*未確認/.test(text)) reasons.add("news_partial");
  if (outcomes.filter(outcome => outcome.code === score.code).length < 3) reasons.add("outcome_insufficient");
  if (score.dataQuality === "missing") reasons.add("price_missing");
  if (score.primaryDisclosureReview?.sourceCoverage.fetchErrorCount && score.primaryDisclosureReview.sourceCoverage.fetchErrorCount > 0) {
    reasons.add("tdnet_unavailable");
  }
  return [...reasons];
}

function qualityLevel(score: LatestScoreEntry, reasons: DataQualityReason[]): "full" | "partial" | "low" {
  if (score.dataQuality === "missing" || reasons.includes("price_missing")) return "low";
  if (score.dataQuality === "ok" && reasons.length === 0) return "full";
  return "partial";
}

function confidenceFromQuality(score: LatestScoreEntry, reasons: DataQualityReason[]): "low" | "medium" | "high" {
  if (score.dataQuality === "missing" || reasons.includes("price_missing")) return "low";
  if (score.dataQuality === "ok" && reasons.length <= 1) return "high";
  return "medium";
}

function toRecordByCode<T extends { code: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map(item => [item.code, item]));
}

type RegimeConfig = {
  asOf?: string;
  mode?: string;
  summary?: string;
  activeRegimes?: Array<{ id: string; level: string; why: string; watchCategories: string[]; caution: string[] }>;
  operatingRules?: string[];
};

function loadWorldContext(): WorldContext | null {
  const path = "config/current-regime.yml";
  if (!existsSync(path)) return null;
  try {
    const raw = load(readFileSync(path, "utf-8")) as RegimeConfig;
    return {
      asOf: raw.asOf ?? "",
      mode: raw.mode ?? "",
      summary: raw.summary ?? "",
      activeRegimes: (raw.activeRegimes ?? []).map(r => ({
        id: r.id,
        level: r.level,
        why: r.why,
        watchCategories: r.watchCategories ?? [],
        caution: r.caution ?? [],
      })),
      operatingRules: raw.operatingRules ?? [],
    };
  } catch { return null; }
}

function main() {
  const date = todayJst();
  const strategic = readText("reports/strategic_advice_latest.md");
  const pipeline = readText("reports/pipeline_health_summary_latest.md");
  const committee = readText("reports/stock_pro_committee_latest.md");
  const roadmap = readText("reports/stock_pro_improvement_roadmap_latest.md");
  const refresh = readText("reports/pro_knowledge_refresh_latest.md");
  const ipoThemeWatch = readText("reports/ipo_theme_watch_latest.md");
  const specialSituationOps = readText("reports/special_situation_ops_summary_latest.md");
  const deepDives = readYaml<DeepDives>("config/company-deep-dives.yml", {});
  const candidates = Object.entries(deepDives.companies ?? {}).map(([code, company]) => toCandidate(code, company, date));

  // 新フィールド
  const universeScanOutput = loadUniverseScanOutput();
  const universeScan = toUniverseScanMetadata(universeScanOutput);
  const universeCandidates = universeScanOutput?.candidates ?? [];
  const hypothesisPredictions = loadHypotheses();
  const hypothesisOutcomes = loadOutcomes();
  const accuracySummary = loadAccuracySummary();
  const worldContext = loadWorldContext();
  const companyMemory = loadCompanyMemory();
  const readiness = loadReadiness();
  const runCursors = readJson<Record<string, unknown>>("data/run-cursors.json") ?? {};
  const latestScores = loadLatestScores();
  const primaryDisclosureReviews = Object.fromEntries(
    latestScores
      .filter(score => score.primaryDisclosureReview)
      .map(score => [score.code, score.primaryDisclosureReview])
  );
  const dataQualityByCode = Object.fromEntries(
    latestScores.map(score => {
      const reasons = inferDataQualityReasons(score, hypothesisOutcomes);
      return [score.code, {
        dataQuality: score.dataQuality ?? "unknown",
        warnings: score.warnings ?? [],
        quality: {
          level: qualityLevel(score, reasons),
          reasons,
          updatedAt: date,
        },
        scoreBreakdown: {
          companyCode: score.code,
          totalScore: score.score ?? 0,
          label: score.alertLevel ?? "ignore",
          positives: [...new Set(score.reasons ?? [])].slice(0, 8),
          negatives: [...new Set(score.negativeReasons ?? [])].slice(0, 8),
          missingData: [...new Set((score.warnings ?? []).filter(warning => /未取得|不足|失敗|404|partial|遅延|FCF|J-Quants/.test(warning)))].slice(0, 8),
          confidence: confidenceFromQuality(score, reasons),
        },
      }];
    })
  );

  // pipeline_status から completeWrapperFailedSteps を読み、meta.warnings に含める
  const metaWarnings: string[] = [];
  const pipelineStatusPath = "reports/pipeline_status_latest.json";
  let pipelineStatusData: Record<string, unknown> | null = null;
  if (existsSync(pipelineStatusPath)) {
    try {
      const pipelineStatus = JSON.parse(readFileSync(pipelineStatusPath, "utf-8")) as {
        completeWrapperFailedSteps?: string[];
        completeWrapperRunAt?: string;
      };
      pipelineStatusData = pipelineStatus as Record<string, unknown>;
      if (Array.isArray(pipelineStatus.completeWrapperFailedSteps) && pipelineStatus.completeWrapperFailedSteps.length > 0) {
        const failed = pipelineStatus.completeWrapperFailedSteps;
        metaWarnings.push(`以下のステップが失敗しました（${pipelineStatus.completeWrapperRunAt ?? "日時不明"}）: ${failed.join(", ")}`);
        if (failed.some(s => s.startsWith("scan:universe"))) {
          metaWarnings.push("scan:universe が失敗しました。universeCandidates が最新でない可能性があります。");
        }
        if (failed.some(s => s.includes("candidate:hypothesis"))) {
          metaWarnings.push("candidate:hypothesis はスキップされました。hypothesisPredictions が更新されていない可能性があります。");
        }
        metaWarnings.push("一部データが最新でない可能性があります。次の daily 実行まで古いデータが表示されます。");
      }
    } catch { /* pipeline_status が壊れていても続行 */ }
  }

  const data = {
    generatedAt: date,
    headline: "alpha-pon Pro Dashboard",
    summary: {
      strategic: strip(section(strategic, "今日まず見る穴", 4).join(" ") || strategic || "strategic advice未生成"),
      pipeline: strip(section(pipeline, "confidence", 4).join(" ") || pipeline || "pipeline health未生成"),
      committee: strip(committee || "Pro会議未生成", 260),
      roadmap: section(roadmap, "priority improvements", 8),
      refresh: section(refresh, "refresh queue", 6)
    },
    reports: [
      { key: "strategic", label: "司令塔", path: "reports/strategic_advice_latest.md", available: Boolean(strategic), excerpt: excerpt(strategic, "今日まず見る穴", "strategic advice未生成") },
      { key: "pipeline", label: "データ信頼度", path: "reports/pipeline_health_summary_latest.md", available: Boolean(pipeline), excerpt: excerpt(pipeline, "confidence", "pipeline health未生成") },
      { key: "committee", label: "Pro会議", path: "reports/stock_pro_committee_latest.md", available: Boolean(committee), excerpt: excerpt(committee, "rule", "Pro会議未生成") },
      { key: "ipoThemeWatch", label: "IPOテーマ監視", path: "reports/ipo_theme_watch_latest.md", available: Boolean(ipoThemeWatch), excerpt: excerpt(ipoThemeWatch, "rules", "IPOテーマ監視未生成") },
      { key: "specialSituationOps", label: "特殊状況 運用確認", path: "reports/special_situation_ops_summary_latest.md", available: Boolean(specialSituationOps), excerpt: excerpt(specialSituationOps, "今日やること", "特殊状況 運用確認未生成") },
      { key: "roadmap", label: "改善ロードマップ", path: "reports/stock_pro_improvement_roadmap_latest.md", available: Boolean(roadmap), excerpt: excerpt(roadmap, "priority improvements", "改善ロードマップ未生成") },
      { key: "refresh", label: "Pro知識更新", path: "reports/pro_knowledge_refresh_latest.md", available: Boolean(refresh), excerpt: excerpt(refresh, "refresh queue", "Pro知識更新未生成") }
    ],
    candidates,
    // 新フィールド（apps/web/public/generated/alpha-pon-data.json にのみ含まれる）
    universeCandidates,
    universeScan,
    hypothesisPredictions,
    hypothesisOutcomes,
    accuracySummary,
    worldContext,
    companyMemory,
    companyMemoryByCode: toRecordByCode(companyMemory),
    primaryDisclosureReviews,
    dataQualityByCode,
    runCursors,
    readiness,
    pipelineStatus: pipelineStatusData,
    meta: {
      source: "report-ui-data",
      version: "2",
      warnings: metaWarnings,
    },
  };

  // --legacy-design オプション指定時のみ design/ へ出力（通常運用では不要）
  const emitLegacyDesign = process.argv.includes("--legacy-design");
  if (emitLegacyDesign) {
    mkdirSync("design/app", { recursive: true });
    const js = [
      "/* generated by src/report-ui-data.ts --legacy-design */",
      `window.AP_GENERATED = ${JSON.stringify(data, null, 2)};`,
      "if (window.AP) {",
      "  window.AP.generated = window.AP_GENERATED;",
      "  if (Array.isArray(window.AP_GENERATED.candidates) && window.AP_GENERATED.candidates.length > 0) {",
      "    window.AP.mockCandidates = window.AP.candidates;",
      "    window.AP.candidates = window.AP_GENERATED.candidates;",
      "  }",
      "}",
      ""
    ].join("\n");
    writeFileSync(join("design", "app", "data.generated.js"), js, "utf-8");
    console.log(`[legacy] generated design/app/data.generated.js (${candidates.length} candidates)`);
  }

  // Next.js向けJSON出力（apps/web/public/generated/） — 通常の出力先
  const webPublicDir = join("apps", "web", "public", "generated");
  mkdirSync(webPublicDir, { recursive: true });

  // candidates から AlphaPonStock[] を生成（Next.js 銘柄一覧ページ向け）
  const stocks = candidates.map((c) => {
    const scoreTotal = c.score && typeof c.score === "object"
      ? Object.values(c.score as Record<string, number>).reduce((a, b) => a + b, 0)
      : null;
    return {
      code: c.code,
      name: c.name,
      market: c.market ?? null,
      sector: Array.isArray(c.tags) && c.tags.length > 0 ? String(c.tags[0]) : null,
      price: c.price ?? null,
      previousClose: null,
      change: null,
      changeRate: c.changePct ?? null,
      per: null,
      pbr: null,
      dividendYield: null,
      marketCap: null,
      score: scoreTotal,
      rank: c.priority ?? null,
      reasons: Array.isArray(c.reasons) ? c.reasons : [],
      updatedAt: c.lastNotifiedAt ?? null,
    };
  });

  // generated_company_rules_latest.json を読み込んで JSON に含める
  const companyRulesPath2 = join(process.cwd(), "data", "generated_company_rules_latest.json");
  const generatedCompanyRules = existsSync(companyRulesPath2)
    ? (() => { try { const r = JSON.parse(readFileSync(companyRulesPath2, "utf-8")); return Array.isArray(r.rules) ? r.rules : []; } catch { return []; } })()
    : [];

  // レポートにfullContentを追加
  const dataWithContent = {
    ...data,
    stocks,
    generatedCompanyRules,
    reports: [
      { key: "strategic", label: "司令塔",          path: "reports/strategic_advice_latest.md",             available: Boolean(strategic), excerpt: excerpt(strategic, "今日まず見る穴", "strategic advice未生成"),         fullContent: strategic || null },
      { key: "pipeline",  label: "データ信頼度",    path: "reports/pipeline_health_summary_latest.md",      available: Boolean(pipeline),  excerpt: excerpt(pipeline,  "confidence",   "pipeline health未生成"),            fullContent: pipeline  || null },
      { key: "committee", label: "Pro会議",          path: "reports/stock_pro_committee_latest.md",          available: Boolean(committee), excerpt: excerpt(committee,  "rule",          "Pro会議未生成"),                    fullContent: committee || null },
      { key: "ipoThemeWatch", label: "IPOテーマ監視", path: "reports/ipo_theme_watch_latest.md",              available: Boolean(ipoThemeWatch), excerpt: excerpt(ipoThemeWatch, "rules", "IPOテーマ監視未生成"), fullContent: ipoThemeWatch || null },
      { key: "specialSituationOps", label: "特殊状況 運用確認", path: "reports/special_situation_ops_summary_latest.md", available: Boolean(specialSituationOps), excerpt: excerpt(specialSituationOps, "今日やること", "特殊状況 運用確認未生成"), fullContent: specialSituationOps || null },
      { key: "roadmap",   label: "改善ロードマップ", path: "reports/stock_pro_improvement_roadmap_latest.md", available: Boolean(roadmap),   excerpt: excerpt(roadmap,   "priority improvements", "改善ロードマップ未生成"), fullContent: roadmap   || null },
      { key: "refresh",   label: "Pro知識更新",      path: "reports/pro_knowledge_refresh_latest.md",        available: Boolean(refresh),   excerpt: excerpt(refresh,   "refresh queue", "Pro知識更新未生成"),               fullContent: refresh   || null },
    ],
  };

  writeFileSync(join(webPublicDir, "alpha-pon-data.json"), JSON.stringify(dataWithContent, null, 2), "utf-8");
  console.log(`generated apps/web/public/generated/alpha-pon-data.json`);

  // 個別 JSON ファイル出力（Route Handler / 直接参照用）
  const companyRulesPath = join(process.cwd(), "data", "generated_company_rules_latest.json");
  const companyRulesData = existsSync(companyRulesPath)
    ? (() => { try { return JSON.parse(readFileSync(companyRulesPath, "utf-8")); } catch { return { rules: [] }; } })()
    : { rules: [] };
  writeFileSync(join(webPublicDir, "company-rules.json"), JSON.stringify(companyRulesData, null, 2), "utf-8");

  const hypothesesOut = { hypotheses: hypothesisPredictions ?? [], generatedAt: date };
  writeFileSync(join(webPublicDir, "hypotheses.json"), JSON.stringify(hypothesesOut, null, 2), "utf-8");

  const outcomesOut = { outcomes: hypothesisOutcomes ?? [], generatedAt: date };
  writeFileSync(join(webPublicDir, "outcomes.json"), JSON.stringify(outcomesOut, null, 2), "utf-8");

  const worldOut = worldContext ?? {};
  writeFileSync(join(webPublicDir, "world-events.json"), JSON.stringify(worldOut, null, 2), "utf-8");

  const candidatesOut = {
    candidates: universeCandidates ?? [],
    generatedAt: date,
    sourceGeneratedAt: universeScanOutput?.generatedAt ?? null,
    dataSource: universeScanOutput?.dataSource ?? null,
    scanStatus: universeScanOutput?.scanStatus ?? null,
    fallbackReason: universeScanOutput?.fallbackReason ?? null,
    count: universeCandidates.length,
  };
  writeFileSync(join(webPublicDir, "stock-candidates.json"), JSON.stringify(candidatesOut, null, 2), "utf-8");

  console.log(`generated apps/web/public/generated/company-rules.json, hypotheses.json, outcomes.json, world-events.json, stock-candidates.json`);
}

main();
