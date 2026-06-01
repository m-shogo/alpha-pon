import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

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

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
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
    if (trimmed) picked.push(strip(trimmed, 120));
    if (picked.length >= maxLines) break;
  }
  return picked;
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

function main() {
  const date = todayJst();
  const strategic = readText("reports/strategic_advice_latest.md");
  const pipeline = readText("reports/pipeline_health_summary_latest.md");
  const committee = readText("reports/stock_pro_committee_latest.md");
  const roadmap = readText("reports/stock_pro_improvement_roadmap_latest.md");
  const refresh = readText("reports/pro_knowledge_refresh_latest.md");
  const deepDives = readYaml<DeepDives>("config/company-deep-dives.yml", {});
  const candidates = Object.entries(deepDives.companies ?? {}).map(([code, company]) => toCandidate(code, company, date));

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
      { key: "strategic", label: "司令塔", path: "reports/strategic_advice_latest.md", available: Boolean(strategic) },
      { key: "pipeline", label: "データ信頼度", path: "reports/pipeline_health_summary_latest.md", available: Boolean(pipeline) },
      { key: "committee", label: "Pro会議", path: "reports/stock_pro_committee_latest.md", available: Boolean(committee) },
      { key: "roadmap", label: "改善ロードマップ", path: "reports/stock_pro_improvement_roadmap_latest.md", available: Boolean(roadmap) },
      { key: "refresh", label: "Pro知識更新", path: "reports/pro_knowledge_refresh_latest.md", available: Boolean(refresh) }
    ],
    candidates
  };

  mkdirSync("design/app", { recursive: true });
  const js = [
    "/* generated by src/report-ui-data.ts */",
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
  console.log(`generated design/app/data.generated.js (${candidates.length} candidates)`);
}

main();
