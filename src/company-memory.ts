import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { loadAnalogyOutcomeRecords, type AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

export type CompanyMemoryRecord = {
  schemaVersion: 1;
  code: string;
  name: string;
  firstSeenAt: string;
  lastReviewedAt: string;
  watchReason: string[];
  knownRisks: string[];
  strongRules: string[];
  weakRules: string[];
  recurringWarnings: string[];
  recentOutcomes: CompanyMemoryOutcome[];
  notes: string[];
};

export type CompanyMemoryOutcome = {
  createdAt: string;
  evaluatedAt: string;
  timeframe?: string;
  lessonTitle: string;
  direction: string;
  quality: string;
  relativeReturnPct?: number;
  maxDrawdownPct?: number;
};

type ScoreLogEntry = {
  code: string;
  name: string;
  priority?: string;
  status?: string;
  tags?: string[];
  rules?: string[];
  score: number;
  alertLevel: string;
  reasons?: string[];
  negativeReasons?: string[];
  warnings?: string[];
  createdAt: string;
};

type RulePerformance = {
  rule: string;
  count: number;
  same: number;
  opposite: number;
  avgRelativeReturnPct: number | null;
};

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function unique(values: string[], limit = 20): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].slice(0, limit);
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function memoryPath(code: string): string {
  return join("data", "company_memory", `${code}.json`);
}

function loadMemory(code: string): CompanyMemoryRecord | null {
  const path = memoryPath(code);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CompanyMemoryRecord;
  } catch {
    return null;
  }
}

function loadScoreLogs(): ScoreLogEntry[] {
  if (!existsSync("reports")) return [];

  return readdirSync("reports")
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .flatMap(file => {
      try {
        return JSON.parse(readFileSync(join("reports", file), "utf-8")) as ScoreLogEntry[];
      } catch {
        return [];
      }
    });
}

function latestScoreByCode(entries: ScoreLogEntry[]): Map<string, ScoreLogEntry> {
  const map = new Map<string, ScoreLogEntry>();
  for (const entry of entries) {
    const current = map.get(entry.code);
    if (!current || entry.createdAt >= current.createdAt) map.set(entry.code, entry);
  }
  return map;
}

function scoreByCodeDate(entries: ScoreLogEntry[]): Map<string, ScoreLogEntry> {
  const map = new Map<string, ScoreLogEntry>();
  for (const entry of entries) map.set(`${entry.createdAt}_${entry.code}`, entry);
  return map;
}

function recentOutcomesForCode(outcomes: AnalogyOutcomeRecord[], code: string): CompanyMemoryOutcome[] {
  return outcomes
    .filter(outcome => outcome.candidateCode === code)
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))
    .slice(0, 12)
    .map(outcome => ({
      createdAt: outcome.createdAt,
      evaluatedAt: outcome.evaluatedAt,
      timeframe: outcome.timeframe,
      lessonTitle: outcome.lessonTitle,
      direction: outcome.direction,
      quality: outcome.quality,
      relativeReturnPct: outcome.relativeReturnPct,
      maxDrawdownPct: outcome.maxDrawdownPct,
    }));
}

function rulePerformanceForCode(outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>, code: string): RulePerformance[] {
  const groups = new Map<string, AnalogyOutcomeRecord[]>();

  for (const outcome of outcomes.filter(o => o.candidateCode === code)) {
    const score = scoreMap.get(`${outcome.createdAt}_${code}`);
    const rules = score?.rules?.length ? score.rules : ["unknown"];
    for (const rule of rules) {
      if (!groups.has(rule)) groups.set(rule, []);
      groups.get(rule)!.push(outcome);
    }
  }

  return [...groups.entries()].map(([rule, group]) => ({
    rule,
    count: group.length,
    same: group.filter(o => o.direction === "same").length,
    opposite: group.filter(o => o.direction === "opposite").length,
    avgRelativeReturnPct: average(group.map(o => o.relativeReturnPct)),
  }));
}

function inferStrongRules(performance: RulePerformance[]): string[] {
  return performance
    .filter(item => item.count >= 3)
    .filter(item => item.same > item.opposite)
    .filter(item => (item.avgRelativeReturnPct ?? 0) >= 0)
    .sort((a, b) => b.same - a.same || (b.avgRelativeReturnPct ?? 0) - (a.avgRelativeReturnPct ?? 0))
    .map(item => item.rule)
    .slice(0, 10);
}

function inferWeakRules(performance: RulePerformance[]): string[] {
  return performance
    .filter(item => item.count >= 3)
    .filter(item => item.opposite > item.same || (item.avgRelativeReturnPct ?? 0) < 0)
    .sort((a, b) => b.opposite - a.opposite || (a.avgRelativeReturnPct ?? 0) - (b.avgRelativeReturnPct ?? 0))
    .map(item => item.rule)
    .slice(0, 10);
}

function watchReasonFromScore(entry: ScoreLogEntry): string[] {
  return unique([
    ...(entry.tags ?? []).map(tag => `tag:${tag}`),
    ...(entry.rules ?? []).map(rule => `rule:${rule}`),
    ...(entry.reasons ?? []).slice(0, 5),
  ], 18);
}

function risksFromScore(entry: ScoreLogEntry): string[] {
  return unique([
    ...(entry.negativeReasons ?? []),
    ...(entry.warnings ?? []).filter(warning =>
      warning.includes("過熱") ||
      warning.includes("FOMO") ||
      warning.includes("流動性") ||
      warning.includes("ボラティリティ") ||
      warning.includes("下方修正") ||
      warning.includes("不足") ||
      warning.includes("missing")
    ),
  ], 20);
}

function recurringWarningsFromScores(entries: ScoreLogEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const warning of entry.warnings ?? []) {
      counts.set(warning, (counts.get(warning) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([warning, count]) => `${warning} (${count}回)`)
    .slice(0, 12);
}

function buildMemory(entry: ScoreLogEntry, allScores: ScoreLogEntry[], outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>): CompanyMemoryRecord {
  const current = loadMemory(entry.code);
  const codeScores = allScores.filter(score => score.code === entry.code);
  const performance = rulePerformanceForCode(outcomes, scoreMap, entry.code);
  const recentOutcomes = recentOutcomesForCode(outcomes, entry.code);
  const strongRules = inferStrongRules(performance);
  const weakRules = inferWeakRules(performance);

  return {
    schemaVersion: 1,
    code: entry.code,
    name: entry.name,
    firstSeenAt: current?.firstSeenAt ?? codeScores[0]?.createdAt ?? entry.createdAt,
    lastReviewedAt: entry.createdAt,
    watchReason: unique([...(current?.watchReason ?? []), ...watchReasonFromScore(entry)], 24),
    knownRisks: unique([...(current?.knownRisks ?? []), ...risksFromScore(entry)], 24),
    strongRules: unique([...strongRules, ...(current?.strongRules ?? []).filter(rule => !weakRules.includes(rule))], 12),
    weakRules: unique([...weakRules, ...(current?.weakRules ?? []).filter(rule => !strongRules.includes(rule))], 12),
    recurringWarnings: unique([...(current?.recurringWarnings ?? []), ...recurringWarningsFromScores(codeScores)], 16),
    recentOutcomes,
    notes: unique(current?.notes ?? [], 20),
  };
}

export function updateCompanyMemory(date: string): CompanyMemoryRecord[] {
  const scores = loadScoreLogs();
  const latest = latestScoreByCode(scores);
  const outcomes = loadAnalogyOutcomeRecords();
  const scoreMap = scoreByCodeDate(scores);
  const records = [...latest.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(entry => buildMemory(entry, scores, outcomes, scoreMap));

  for (const record of records) {
    const path = memoryPath(record.code);
    ensureDir(path);
    writeFileSync(path, JSON.stringify(record, null, 2), "utf-8");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `company_memory_${date}.json`), JSON.stringify(records, null, 2), "utf-8");
  writeFileSync(join("reports", "company_memory_latest.json"), JSON.stringify(records, null, 2), "utf-8");
  writeFileSync(join("reports", `company_memory_${date}.md`), renderCompanyMemoryReport(date, records), "utf-8");
  writeFileSync(join("reports", "company_memory_latest.md"), renderCompanyMemoryReport(date, records), "utf-8");
  return records;
}

export function renderCompanyMemoryReport(date: string, records: CompanyMemoryRecord[]): string {
  const lines: string[] = [];
  lines.push("# alpha-pon company memory レポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 銘柄ごとの監視理由・既知リスク・過去の答え合わせを残すための反省ノートです。買い推奨ではありません。");
  lines.push("");
  lines.push("## サマリー");
  lines.push("");
  lines.push(`- memory作成銘柄: ${records.length}件`);
  lines.push(`- weakRulesあり: ${records.filter(record => record.weakRules.length > 0).length}件`);
  lines.push(`- recentOutcomesあり: ${records.filter(record => record.recentOutcomes.length > 0).length}件`);
  lines.push("");

  lines.push("## 銘柄別 memory");
  lines.push("");
  for (const record of records) {
    lines.push(`### ${record.code} ${record.name}`);
    lines.push("");
    lines.push(`- firstSeenAt: ${record.firstSeenAt}`);
    lines.push(`- lastReviewedAt: ${record.lastReviewedAt}`);
    lines.push(`- watchReason: ${record.watchReason.slice(0, 5).join(" / ") || "-"}`);
    lines.push(`- knownRisks: ${record.knownRisks.slice(0, 5).join(" / ") || "-"}`);
    lines.push(`- strongRules: ${record.strongRules.join(" / ") || "-"}`);
    lines.push(`- weakRules: ${record.weakRules.join(" / ") || "-"}`);
    if (record.recentOutcomes.length > 0) {
      const latest = record.recentOutcomes[0]!;
      lines.push(`- latestOutcome: ${latest.timeframe ?? "?"} ${latest.direction}/${latest.quality} relative=${fmtPct(latest.relativeReturnPct)} lesson=${latest.lessonTitle}`);
    }
    lines.push("");
  }

  lines.push("## 安全原則");
  lines.push("");
  lines.push("- company memory はスコア加点に直接使わない");
  lines.push("- weakRules は自動削除しない。人間がレポートを見て判断する");
  lines.push("- recentOutcomes は反省用であり、買い推奨ではない");
  lines.push("- 件数が少ない銘柄では強い結論を出さない");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon company memory | ${date} | ※買い推奨ではありません*`);
  return lines.join("\n");
}
