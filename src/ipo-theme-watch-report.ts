import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import type { HypothesisOutcome } from "./universe.js";

type PhaseRule = {
  id: string;
  label: string;
  defaultAction: string;
  focus?: string[];
  touchAvoidReasons?: string[];
};

type RelatedCompany = {
  code: string;
  name: string;
  relation: string;
};

type ThemeRule = {
  id: string;
  label: string;
  names?: string[];
  defaultAction: string;
  watchEvidence?: string[];
  japaneseSpilloverThemes?: string[];
  relatedCompanies?: RelatedCompany[];
};

type IpoThemeWatchConfig = {
  version: number;
  description: string;
  defaultAction: string;
  neverTreatAs: string[];
  globalReferenceEvents?: string[];
  safetyRules?: string[];
  phases: PhaseRule[];
  themes: ThemeRule[];
  outcomeStats?: {
    minSampleSize?: number;
    horizons?: string[];
    groupBy?: string[];
  };
};

type IpoThemeWatchOutcomeStats = {
  themeId: string;
  phase: string;
  relatedCompanyCode: string;
  /** actionLabel (watch/log/ignore): 予測時の判断ラベル */
  finalLabel: string;
  /** result (hit/miss/too_early/etc): 評価後の結果 - sampleTooSmall=true の場合は強い判断に使わない */
  originalFinalLabel: string;
  sampleSize: number;
  sampleTooSmall: boolean;
  hitRate: number | null;
  avgReturn1w: number | null;
  avgReturn1m: number | null;
  avgTopixRelative1m: number | null;
  /** post_hype_drawdown 価格シグナル由来かどうか */
  phaseFromPriceSignal: boolean;
};

type WorldEventHighlight = {
  title: string;
  source: string;
  publishedAt: string;
  snippet: string;
  relatedThemeIds: string[];
};

type IpoThemeWatchReport = {
  generatedAt: string;
  defaultAction: string;
  neverTreatAs: string[];
  globalReferenceEvents: string[];
  safetyRules: string[];
  phases: PhaseRule[];
  rules: Array<ThemeRule & {
    phaseIds: string[];
    touchAvoidReasons: string[];
    evidenceNeeded: string[];
  }>;
  outcomeStats: IpoThemeWatchOutcomeStats[];
  worldEventHighlights: WorldEventHighlight[];
};

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function hitRate(outcomes: HypothesisOutcome[]): number | null {
  const judged = outcomes.filter(outcome => outcome.result === "hit" || outcome.result === "miss");
  if (judged.length === 0) return null;
  return judged.filter(outcome => outcome.result === "hit").length / judged.length;
}

function majorityValue(values: string[]): string {
  if (values.length === 0) return "unknown";
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * テキストベースのフェーズ推論（従来ロジック）
 */
function inferPhaseFromText(outcome: HypothesisOutcome): string | null {
  const text = [
    outcome.hypothesis.reason,
    ...(outcome.hypothesis.evidenceNeeded ?? []),
    ...(outcome.hypothesis.invalidationSignals ?? []),
  ].join(" ").toLowerCase();
  if (/lockup|ロックアップ/.test(text)) return "lockup_expiry";
  if (/決算|earnings/.test(text)) return "first_earnings";
  if (/高値|過熱|fomo|drawdown|押し目/.test(text)) return "post_hype_drawdown";
  if (/s-1|ipo|上場|公開価格/.test(text)) return "pre_ipo";
  if (/売上|受注|粗利|nand|ssd|市況|fundamental/.test(text)) return "fundamental_confirmation";
  return null;
}

/**
 * 価格データベースの post_hype_drawdown 判定
 * - 高値からの下落率 (maxDrawdownPct) ≤ -15%
 * - かつ TOPIX比 (relativeToTopix1m) ≤ -10% または 1ヶ月リターン ≤ -20%
 */
function inferPostHypeFromPriceData(outcome: HypothesisOutcome): boolean {
  const drawdown = outcome.maxDrawdownPct;
  const relTopix = outcome.relativeToTopix1m;
  const ret1m = outcome.return1m;
  if (drawdown != null && drawdown <= -15) {
    if (relTopix != null && relTopix <= -10) return true;
    if (ret1m != null && ret1m <= -20) return true;
  }
  return false;
}

/**
 * フェーズ推論: テキスト → 価格シグナル → デフォルト
 * Returns { phase, fromPriceSignal }
 */
function inferPhase(outcome: HypothesisOutcome): { phase: string; fromPriceSignal: boolean } {
  const textPhase = inferPhaseFromText(outcome);
  if (textPhase != null) return { phase: textPhase, fromPriceSignal: false };
  if (inferPostHypeFromPriceData(outcome)) return { phase: "post_hype_drawdown", fromPriceSignal: true };
  return { phase: "pre_ipo", fromPriceSignal: false };
}

function companyMatchesTheme(outcome: HypothesisOutcome, theme: ThemeRule): boolean {
  const code = outcome.code;
  const text = [
    outcome.name,
    outcome.hypothesis.reason,
    ...(outcome.hypothesis.relatedWorldEventIds ?? []),
    ...(outcome.hypothesis.evidenceNeeded ?? []),
  ].join(" ").toLowerCase();
  const companyMatch = (theme.relatedCompanies ?? []).some(company => company.code === code);
  const nameMatch = (theme.names ?? []).some(name => text.includes(name.toLowerCase()));
  const themeMatch = (theme.japaneseSpilloverThemes ?? []).some(themeName => text.includes(themeName.toLowerCase()));
  return companyMatch || nameMatch || themeMatch;
}

function buildOutcomeStats(config: IpoThemeWatchConfig): IpoThemeWatchOutcomeStats[] {
  const outcomes = readJsonl<HypothesisOutcome>("data/hypothesis_outcomes.jsonl");
  const minSampleSize = config.outcomeStats?.minSampleSize ?? 5;
  const stats: IpoThemeWatchOutcomeStats[] = [];

  for (const theme of config.themes) {
    const themeOutcomes = outcomes.filter(outcome => companyMatchesTheme(outcome, theme));
    const companies = theme.relatedCompanies ?? [];
    for (const company of companies) {
      const companyOutcomes = themeOutcomes.filter(outcome => outcome.code === company.code);

      // phase × finalLabel でグループ化
      type GroupKey = { phase: string; finalLabel: string; fromPriceSignal: boolean };
      const groupMap = new Map<string, { key: GroupKey; rows: HypothesisOutcome[] }>();
      for (const outcome of companyOutcomes) {
        const { phase, fromPriceSignal } = inferPhase(outcome);
        const label = outcome.actionLabel ?? "unknown";
        const key = `${phase}::${label}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { key: { phase, finalLabel: label, fromPriceSignal }, rows: [] });
        }
        groupMap.get(key)!.rows.push(outcome);
      }

      // データが1件もない場合は pre_ipo / unknown グループを1件作る
      if (groupMap.size === 0) {
        groupMap.set("pre_ipo::unknown", {
          key: { phase: "pre_ipo", finalLabel: "unknown", fromPriceSignal: false },
          rows: [],
        });
      }

      for (const { key, rows } of groupMap.values()) {
        stats.push({
          themeId: theme.id,
          phase: key.phase,
          relatedCompanyCode: company.code,
          finalLabel: key.finalLabel,
          originalFinalLabel: majorityValue(rows.map(r => r.result)),
          sampleSize: rows.length,
          sampleTooSmall: rows.length < minSampleSize,
          hitRate: hitRate(rows),
          avgReturn1w: avg(rows.map(row => row.return1w)),
          avgReturn1m: avg(rows.map(row => row.return1m)),
          avgTopixRelative1m: avg(rows.map(row => row.relativeToTopix1m)),
          phaseFromPriceSignal: key.fromPriceSignal,
        });
      }
    }
  }

  return stats;
}

/** world_events_latest.json からテーマ関連イベントを抽出 */
function loadRelevantWorldEvents(themes: ThemeRule[]): WorldEventHighlight[] {
  const path = join(process.cwd(), "reports", "world_events_latest.json");
  if (!existsSync(path)) return [];

  type RawEvent = { title?: string; source?: string; publishedAt?: string; snippet?: string };
  let events: RawEvent[] = [];
  try {
    events = JSON.parse(readFileSync(path, "utf-8")) as RawEvent[];
  } catch {
    return [];
  }

  const themeKeywords: Record<string, string[]> = {};
  for (const theme of themes) {
    themeKeywords[theme.id] = [
      ...(theme.names ?? []).map(n => n.toLowerCase()),
      ...(theme.relatedCompanies ?? []).flatMap(c => [c.name.toLowerCase()]),
    ];
  }

  const highlights: WorldEventHighlight[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const title = event.title ?? "";
    const snippet = event.snippet ?? "";
    const textLower = (title + " " + snippet).toLowerCase();

    const relatedThemeIds: string[] = [];
    for (const [themeId, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(kw => textLower.includes(kw))) {
        relatedThemeIds.push(themeId);
      }
    }
    if (relatedThemeIds.length === 0) continue;

    const dedupKey = title.slice(0, 60);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    // snippetからHTMLタグ・エンティティを除去
    const cleanSnippet = snippet
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);

    // publishedAt を ISO 8601 に正規化（RFC 822 形式にも対応）
    const rawDate = event.publishedAt ?? "";
    let normalizedDate = rawDate;
    try {
      const d = new Date(rawDate);
      if (!Number.isNaN(d.getTime())) normalizedDate = d.toISOString().slice(0, 10);
    } catch { /* keep raw */ }

    highlights.push({
      title: title.slice(0, 120),
      source: event.source ?? "",
      publishedAt: normalizedDate,
      snippet: cleanSnippet,
      relatedThemeIds,
    });
  }

  // 直近順に最大20件
  return highlights
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 20);
}

function buildReport(config: IpoThemeWatchConfig): IpoThemeWatchReport {
  const generatedAt = todayJst();
  const phaseIds = config.phases.map(phase => phase.id);
  const allAvoidReasons = [...new Set(config.phases.flatMap(phase => phase.touchAvoidReasons ?? []))];

  return {
    generatedAt,
    defaultAction: config.defaultAction,
    neverTreatAs: config.neverTreatAs,
    globalReferenceEvents: config.globalReferenceEvents ?? [],
    safetyRules: config.safetyRules ?? [],
    phases: config.phases,
    rules: config.themes.map(theme => ({
      ...theme,
      phaseIds,
      touchAvoidReasons: allAvoidReasons,
      evidenceNeeded: [
        ...(theme.watchEvidence ?? []),
        ...config.phases.flatMap(phase => phase.focus ?? []),
      ].filter((value, index, array) => array.indexOf(value) === index),
    })),
    outcomeStats: buildOutcomeStats(config),
    worldEventHighlights: loadRelevantWorldEvents(config.themes),
  };
}

function fmtPct(value: number | null): string {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function renderMarkdown(report: IpoThemeWatchReport): string {
  const lines: string[] = [];
  lines.push("# alpha-pon IPO theme watch report", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push("> 大型IPO/AI/宇宙テーマを、監視・証拠確認・待つ理由として扱います。売買推奨ではありません。", "");
  lines.push("## default action", "");
  lines.push(`- ${report.defaultAction}`, "");
  lines.push("## never treat as", "");
  for (const item of report.neverTreatAs) lines.push(`- ${item}`);
  lines.push("");
  if (report.globalReferenceEvents.length > 0) {
    lines.push("## global reference events", "");
    for (const item of report.globalReferenceEvents) lines.push(`- ${item}`);
    lines.push("");
  }
  if (report.safetyRules.length > 0) {
    lines.push("## safety rules", "");
    for (const item of report.safetyRules) lines.push(`- ${item}`);
    lines.push("");
  }
  lines.push("## phases", "");
  for (const phase of report.phases) {
    lines.push(`### ${phase.label} (${phase.id})`);
    lines.push(`- defaultAction: ${phase.defaultAction}`);
    if ((phase.focus ?? []).length > 0) {
      lines.push("- evidence:");
      for (const item of phase.focus ?? []) lines.push(`  - ${item}`);
    }
    if ((phase.touchAvoidReasons ?? []).length > 0) {
      lines.push("- wait reasons:");
      for (const item of phase.touchAvoidReasons ?? []) lines.push(`  - ${item}`);
    }
    lines.push("");
  }
  lines.push("## rules", "");
  for (const rule of report.rules) {
    lines.push(`### ${rule.label} (${rule.id})`);
    lines.push(`- defaultAction: ${rule.defaultAction}`);
    if ((rule.names ?? []).length > 0) lines.push(`- watch names: ${(rule.names ?? []).join(" / ")}`);
    lines.push("- evidence needed:");
    for (const item of rule.evidenceNeeded.slice(0, 12)) lines.push(`  - ${item}`);
    lines.push("- spillover themes:");
    for (const item of rule.japaneseSpilloverThemes ?? []) lines.push(`  - ${item}`);
    lines.push("- related companies:");
    for (const company of rule.relatedCompanies ?? []) lines.push(`  - ${company.code} ${company.name}: ${company.relation}`);
    lines.push("");
  }

  // world event highlights
  if (report.worldEventHighlights.length > 0) {
    lines.push("## world event highlights (scan:world より)", "");
    lines.push("> ※ 個別イベントは売買の根拠ではなく、テーマ監視の参照情報として扱う", "");
    for (const ev of report.worldEventHighlights) {
      const themes = ev.relatedThemeIds.join(", ");
      const date = ev.publishedAt.slice(0, 10);
      lines.push(`### [${date}] ${ev.title}`);
      lines.push(`- source: ${ev.source}`);
      lines.push(`- themes: ${themes}`);
      if (ev.snippet) lines.push(`- snippet: ${ev.snippet}`);
      lines.push("");
    }
  }

  lines.push("## outcome stats", "");
  lines.push("> sampleTooSmall=true の行は参考値です。強い判断の根拠にしないでください。", "");
  lines.push("| themeId | phase | code | finalLabel | origLabel | sample | hitRate | avgReturn1w | avgReturn1m | avgTopixRel1m | notes |");
  lines.push("|---|---|---:|---|---|---:|---:|---:|---:|---:|---|");
  for (const row of report.outcomeStats) {
    const sampleNote = row.sampleTooSmall ? " ⚠小" : "";
    const priceNote = row.phaseFromPriceSignal ? "価格推定" : "";
    const notice = row.sampleTooSmall ? "[参考値・強い判断に使わない]" : priceNote;
    lines.push(`| ${row.themeId} | ${row.phase} | ${row.relatedCompanyCode} | ${row.finalLabel} | ${row.originalFinalLabel} | ${row.sampleSize}${sampleNote} | ${row.hitRate == null ? "N/A" : `${Math.round(row.hitRate * 100)}%`} | ${fmtPct(row.avgReturn1w)} | ${fmtPct(row.avgReturn1m)} | ${fmtPct(row.avgTopixRelative1m)} | ${notice} |`);
  }
  lines.push("", "## rule", "- テーマ名だけで判断しない", "- 公式情報・決算・価格シグナル・出来高を確認する", "- sampleTooSmall の統計は方向感として扱わない・強い判断の根拠にしない", "- 関連銘柄は本命/周辺/恩恵なしを分ける", "- 調査候補は売買推奨ではない");
  lines.push("", `*alpha-pon IPO theme watch | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const config = readYaml<IpoThemeWatchConfig>("config/ipo-theme-watch-rules.yml");
  const report = buildReport(config);
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "ipo_theme_watch_latest.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join("reports", "ipo_theme_watch_latest.md"), renderMarkdown(report), "utf-8");
  console.log(`ipo theme watch report generated: ${report.rules.length} themes, ${report.outcomeStats.length} outcome rows, ${report.worldEventHighlights.length} world event highlights`);
}

main();
