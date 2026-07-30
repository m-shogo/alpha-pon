// 企業固有ショックの現在監視 + 過去類似比較レポート。
// pnpm report:shocks

import { mkdirSync, writeFileSync } from "fs";
import { addDaysJst, daysSinceJst, todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import {
  buildNotificationDecision,
  findClosestHistoricalCases,
  inferPriceState,
  totalShockScore,
  type HistoricalShockCase,
  type ShockCandidate,
  type ShockDimensionScores,
  type ShockPriceState,
} from "./idiosyncratic-shock.js";
import { loadActiveShockConfig, loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";

type ActiveConfigCandidate = ReturnType<typeof loadActiveShockConfig>["candidates"][number];

type EvaluatedCandidate = {
  candidate: ShockCandidate;
  priceSource: "jquants" | "manual_override" | "missing";
  priceAsOf: string | null;
  decision: ReturnType<typeof buildNotificationDecision>;
  analogues: Array<{
    id: string;
    company: string;
    eventDate: string;
    category: string;
    score: number;
    outcomePattern: string;
    distance: number;
    lesson: string;
  }>;
};

function normalizeDate(date: string): string {
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date.slice(0, 10);
}

function priceScore(state: ShockPriceState): 0 | 1 | 2 {
  if (state === "stabilized_after_drop") return 2;
  if (state === "stabilizing") return 1;
  return 0;
}

async function resolvePriceState(raw: ActiveConfigCandidate): Promise<{
  state: ShockPriceState;
  source: "jquants" | "manual_override" | "missing";
  asOf: string | null;
}> {
  const today = todayJst();
  if (raw.code && isJQuantsConfigured()) {
    try {
      const from = addDaysJst(today, -35).replaceAll("-", "");
      const to = today.replaceAll("-", "");
      const quotes = await fetchDailyQuotes(raw.code, from, to);
      const sortedQuotes = [...quotes].sort((a, b) => normalizeDate(a.Date).localeCompare(normalizeDate(b.Date)));
      const latest = sortedQuotes.at(-1);
      if (latest) {
        const latestDate = normalizeDate(latest.Date);
        const age = daysSinceJst(latestDate);
        // J-Quantsの契約プラン等でデータが遅延している場合は底打ち判定に使わない。
        if (age !== null && age >= 0 && age <= 5) {
          const state = inferPriceState(sortedQuotes.map(row => ({
            date: normalizeDate(row.Date),
            close: row.AdjustmentClose,
            volume: row.AdjustmentVolume,
          })));
          return { state, source: "jquants", asOf: latestDate };
        }
      }
    } catch (error) {
      console.warn(`shock price fetch failed ${raw.code}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (raw.priceStateOverride && raw.priceStateCheckedAt) {
    const age = daysSinceJst(raw.priceStateCheckedAt);
    const maxAgeDays = Number(process.env.SHOCK_PRICE_OVERRIDE_MAX_AGE_DAYS ?? "3");
    if (age !== null && age >= 0 && age <= maxAgeDays) {
      return { state: raw.priceStateOverride, source: "manual_override", asOf: raw.priceStateCheckedAt };
    }
  }
  return { state: "unknown", source: "missing", asOf: null };
}

function withDynamicPriceScore(scores: ShockDimensionScores, state: ShockPriceState): ShockDimensionScores {
  return { ...scores, priceStabilization: priceScore(state) };
}

async function evaluate(raw: ActiveConfigCandidate, historical: HistoricalShockCase[]): Promise<EvaluatedCandidate> {
  const resolved = await resolvePriceState(raw);
  const candidate: ShockCandidate = {
    id: raw.id,
    code: raw.code ?? null,
    company: raw.company,
    detectedAt: raw.detectedAt,
    category: raw.category,
    actorType: raw.actorType,
    eventSummary: raw.eventSummary,
    macroPrimaryCause: raw.macroPrimaryCause,
    evidenceStatus: raw.evidenceStatus,
    priceState: resolved.state,
    scores: withDynamicPriceScore(raw.scores, resolved.state),
    criticalLicenseOrDelistingRisk: raw.criticalLicenseOrDelistingRisk,
    sources: raw.sources,
  };
  const decision = buildNotificationDecision(candidate);
  const analogues = findClosestHistoricalCases(candidate, historical, 5).map(({ item, distance }) => ({
    id: item.id,
    company: item.company,
    eventDate: item.eventDate,
    category: item.category,
    score: item.score,
    outcomePattern: item.outcome?.recoveryPattern ?? "unknown",
    distance,
    lesson: item.outcome?.summary ?? "",
  }));
  return { candidate, priceSource: resolved.source, priceAsOf: resolved.asOf, decision, analogues };
}

function historicalStats(cases: HistoricalShockCase[]) {
  const byCategory = new Map<string, HistoricalShockCase[]>();
  for (const item of cases) {
    const rows = byCategory.get(item.category) ?? [];
    rows.push(item);
    byCategory.set(item.category, rows);
  }
  return [...byCategory.entries()]
    .map(([category, rows]) => ({
      category,
      count: rows.length,
      avgScore: Number((rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(1)),
      researchPriority: rows.filter(row => row.score >= 16).length,
      watchOrHigher: rows.filter(row => row.score >= 12).length,
      failedOutcomes: rows.filter(row => row.outcome?.recoveryPattern === "failed").length,
    }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore);
}

function renderMarkdown(date: string, evaluated: EvaluatedCandidate[], historical: HistoricalShockCase[]): string {
  const lines = [
    "# 企業固有ショック / 不祥事ディップ監視",
    "",
    `生成日: ${date}`,
    "",
    "> 12点以上は通知の必要条件であり、十分条件ではありません。一次情報確認 + マクロ非起因 + 下落一巡を必須にします。",
    "> 売買推奨ではありません。急落中・急反発中は待ちます。",
    "",
    "## 現在の監視候補",
    "",
  ];

  if (evaluated.length === 0) lines.push("- なし", "");
  for (const row of evaluated) {
    lines.push(`### ${row.candidate.code ?? "-"} ${row.candidate.company}`);
    lines.push(`- score: **${row.decision.score}/20** (${row.decision.label})`);
    lines.push(`- category: ${row.candidate.category} / actor: ${row.candidate.actorType}`);
    lines.push(`- evidence: ${row.candidate.evidenceStatus}`);
    lines.push(`- price: ${row.candidate.priceState} / source=${row.priceSource} / asOf=${row.priceAsOf ?? "-"}`);
    lines.push(`- notification: ${row.decision.eligible ? "PASS（調査候補通知）" : "WAIT"}`);
    if (row.decision.blockers.length > 0) lines.push(`- blockers: ${row.decision.blockers.join(" / ")}`);
    lines.push(`- event: ${row.candidate.eventSummary}`);
    lines.push("- closest analogues:");
    for (const analogy of row.analogues.slice(0, 3)) {
      lines.push(`  - ${analogy.company} ${analogy.eventDate}: distance=${analogy.distance}, score=${analogy.score}/20, outcome=${analogy.outcomePattern}`);
      if (analogy.lesson) lines.push(`    - ${analogy.lesson}`);
    }
    lines.push("");
  }

  lines.push("## 過去事例DB", "");
  lines.push(`- cases: ${historical.length}`);
  lines.push(`- 16-20点: ${historical.filter(row => row.score >= 16).length}`);
  lines.push(`- 12-15点: ${historical.filter(row => row.score >= 12 && row.score < 16).length}`);
  lines.push(`- 8-11点: ${historical.filter(row => row.score >= 8 && row.score < 12).length}`);
  lines.push(`- 0-7点: ${historical.filter(row => row.score < 8).length}`);
  lines.push("");
  lines.push("### category stats", "");
  lines.push("| category | n | avg score | >=16 | >=12 | failed outcome |", "|---|---:|---:|---:|---:|---:|");
  for (const stat of historicalStats(historical)) {
    lines.push(`| ${stat.category} | ${stat.count} | ${stat.avgScore} | ${stat.researchPriority} | ${stat.watchOrHigher} | ${stat.failedOutcomes} |`);
  }
  lines.push("", "## 読み方", "");
  lines.push("- 高得点でも priceState が falling / volatile / rebounded_too_fast なら通知しません。");
  lines.push("- accountingIntegrity=0 は12点以上でも強制ブロックです。");
  lines.push("- 過去outcomeは類似事例の教訓用で、当時scoreへ逆流させません。");
  lines.push("- low confidence のseedは一次情報を追加して更新します。");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const date = todayJst();
  const historical = loadHistoricalShockCases();
  const active = loadActiveShockConfig();
  const evaluated: EvaluatedCandidate[] = [];
  for (const candidate of active.candidates) evaluated.push(await evaluate(candidate, historical));

  mkdirSync("reports", { recursive: true });
  const payload = {
    generatedAt: date,
    historicalCaseCount: historical.length,
    historicalStats: historicalStats(historical),
    candidates: evaluated,
  };
  writeFileSync("reports/idiosyncratic_shock_watch_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(`reports/idiosyncratic_shock_watch_${date}.json`, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_watch_latest.md", renderMarkdown(date, evaluated, historical), "utf-8");
  console.log(`企業固有ショック watch: active=${evaluated.length} historical=${historical.length}`);
  for (const row of evaluated) {
    console.log(`  ${row.candidate.code ?? "-"} ${row.candidate.company}: ${totalShockScore(row.candidate.scores)}/20 ${row.candidate.priceState} notify=${row.decision.eligible}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
