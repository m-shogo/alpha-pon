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
  sampleSize: number;
  sampleTooSmall: boolean;
  hitRate: number | null;
  avgReturn1w: number | null;
  avgReturn1m: number | null;
  avgTopixRelative1m: number | null;
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

function inferPhase(outcome: HypothesisOutcome): string {
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
  return "pre_ipo";
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
      const phases = [...new Set(companyOutcomes.map(inferPhase))];
      const phaseList = phases.length > 0 ? phases : ["pre_ipo"];
      for (const phase of phaseList) {
        const rows = companyOutcomes.filter(outcome => inferPhase(outcome) === phase);
        stats.push({
          themeId: theme.id,
          phase,
          relatedCompanyCode: company.code,
          sampleSize: rows.length,
          sampleTooSmall: rows.length < minSampleSize,
          hitRate: hitRate(rows),
          avgReturn1w: avg(rows.map(row => row.return1w)),
          avgReturn1m: avg(rows.map(row => row.return1m)),
          avgTopixRelative1m: avg(rows.map(row => row.relativeToTopix1m)),
        });
      }
    }
  }

  return stats;
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
  lines.push("## outcome stats", "");
  lines.push("| themeId | phase | code | sample | hitRate | avgReturn1w | avgReturn1m | avgTopixRelative1m |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|");
  for (const row of report.outcomeStats) {
    lines.push(`| ${row.themeId} | ${row.phase} | ${row.relatedCompanyCode} | ${row.sampleSize}${row.sampleTooSmall ? " small" : ""} | ${row.hitRate == null ? "N/A" : `${Math.round(row.hitRate * 100)}%`} | ${fmtPct(row.avgReturn1w)} | ${fmtPct(row.avgReturn1m)} | ${fmtPct(row.avgTopixRelative1m)} |`);
  }
  lines.push("", "## rule", "- テーマ名だけで判断しない", "- 公式情報・決算・価格シグナル・出来高を確認する", "- sampleTooSmall の統計は方向感として扱わない", "- 関連銘柄は本命/周辺/恩恵なしを分ける");
  lines.push("", `*alpha-pon IPO theme watch | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const config = readYaml<IpoThemeWatchConfig>("config/ipo-theme-watch-rules.yml");
  const report = buildReport(config);
  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "ipo_theme_watch_latest.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join("reports", "ipo_theme_watch_latest.md"), renderMarkdown(report), "utf-8");
  console.log(`ipo theme watch report generated: ${report.rules.length} themes, ${report.outcomeStats.length} outcome rows`);
}

main();
