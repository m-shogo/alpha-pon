// 学習レポート生成
// reports/scores_*.json と data/analogy_outcomes.jsonl を読み、ルール・警告・答え合わせ傾向を集計する
// pnpm learn

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { loadAnalogyOutcomeRecords, type AnalogyOutcomeRecord } from "./analysis/analogy-db.js";

type ExpertLensLog = {
  key: string;
  name: string;
  verdict: string;
  confidence: number;
  reasons: string[];
  objections: string[];
  nextChecks: string[];
};

type ScoreLogEntry = {
  code: string;
  name: string;
  priority?: string;
  tags?: string[];
  rules?: string[];
  score: number;
  alertLevel: string;
  reasons?: string[];
  negativeReasons?: string[];
  warnings?: string[];
  dataQuality?: string;
  hypeRisk?: { score: number; level: string; reasons: string[]; warnings: string[] };
  riskReview?: {
    decision: string;
    blockers: string[];
    warnings: string[];
    strengths: string[];
    checklist: Record<string, boolean>;
  };
  expertReview?: {
    finalVerdict: string;
    consensusScore: number;
    passCount: number;
    cautionCount: number;
    blockCount: number;
    strongCount: number;
    lenses: ExpertLensLog[];
    disagreements: string[];
    requiredBeforeNotification: string[];
  };
  createdAt: string;
};

type GroupStats = {
  count: number;
  avgScore: number;
  urgent: number;
  daily: number;
  log: number;
  ignore: number;
  reject: number;
  highQuality: number;
  expertBlock: number;
  expertStrong: number;
};

type OutcomeStats = {
  count: number;
  same: number;
  opposite: number;
  mixed: number;
  unknown: number;
  useful: number;
  misleading: number;
};

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries(map: Map<string, number>, limit = 10): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function groupBy(entries: ScoreLogEntry[], getKeys: (entry: ScoreLogEntry) => string[]): Map<string, ScoreLogEntry[]> {
  const groups = new Map<string, ScoreLogEntry[]>();
  for (const entry of entries) {
    for (const key of getKeys(entry)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }
  }
  return groups;
}

function calcGroupStats(entries: ScoreLogEntry[]): GroupStats {
  const count = entries.length;
  const avgScore = count > 0 ? entries.reduce((sum, e) => sum + e.score, 0) / count : 0;
  return {
    count,
    avgScore,
    urgent: entries.filter(e => e.alertLevel === "urgent").length,
    daily: entries.filter(e => e.alertLevel === "daily").length,
    log: entries.filter(e => e.alertLevel === "log").length,
    ignore: entries.filter(e => e.alertLevel === "ignore").length,
    reject: entries.filter(e => e.riskReview?.decision === "reject").length,
    highQuality: entries.filter(e => e.riskReview?.decision === "high_quality_candidate").length,
    expertBlock: entries.filter(e => e.expertReview?.finalVerdict === "block").length,
    expertStrong: entries.filter(e => e.expertReview?.finalVerdict === "strong").length,
  };
}

function pushGroupTable(lines: string[], title: string, groups: Map<string, ScoreLogEntry[]>): void {
  if (groups.size === 0) return;

  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| グループ | 件数 | 平均スコア | 即通知 | 朝まとめ | ログ | 対象外 | 要確認 | 高品質候補 | 専門家block | 専門家strong |");
  lines.push("|----------|------|------------|--------|----------|------|--------|--------|------------|------------|--------------|");

  for (const [key, entries] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = calcGroupStats(entries);
    lines.push(`| ${key} | ${s.count} | ${s.avgScore.toFixed(1)} | ${s.urgent} | ${s.daily} | ${s.log} | ${s.ignore} | ${s.reject} | ${s.highQuality} | ${s.expertBlock} | ${s.expertStrong} |`);
  }
  lines.push("");
}

function loadScoreLogs(): ScoreLogEntry[] {
  const reportsDir = "reports";
  if (!existsSync(reportsDir)) return [];

  const files = readdirSync(reportsDir)
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  const entries: ScoreLogEntry[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(reportsDir, file), "utf-8")) as ScoreLogEntry[];
      entries.push(...parsed);
    } catch {
      // 壊れたログはスキップ
    }
  }

  return entries;
}

function scoreBand(score: number): string {
  if (score >= 90) return "90-100";
  if (score >= 80) return "80-89";
  if (score >= 70) return "70-79";
  if (score >= 60) return "60-69";
  if (score >= 50) return "50-59";
  return "0-49";
}

function scoreByCodeDate(entries: ScoreLogEntry[]): Map<string, ScoreLogEntry> {
  const map = new Map<string, ScoreLogEntry>();
  for (const entry of entries) {
    map.set(`${entry.createdAt}_${entry.code}`, entry);
  }
  return map;
}

function calcOutcomeStats(outcomes: AnalogyOutcomeRecord[]): OutcomeStats {
  return {
    count: outcomes.length,
    same: outcomes.filter(o => o.direction === "same").length,
    opposite: outcomes.filter(o => o.direction === "opposite").length,
    mixed: outcomes.filter(o => o.direction === "mixed").length,
    unknown: outcomes.filter(o => o.direction === "unknown").length,
    useful: outcomes.filter(o => o.quality === "useful").length,
    misleading: outcomes.filter(o => o.quality === "misleading").length,
  };
}

function expectationScore(stats: OutcomeStats): number {
  if (stats.count === 0) return 0;
  // same=+1, mixed=0, opposite=-1, unknown=0 とした仮の期待値。実リターン金額ではなく方向性の品質指標。
  return (stats.same - stats.opposite) / stats.count;
}

function pushOutcomeTable(lines: string[], title: string, groups: Map<string, AnalogyOutcomeRecord[]>): void {
  if (groups.size === 0) return;

  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| グループ | 件数 | same | opposite | mixed | unknown | useful | misleading | 方向性期待値 |");
  lines.push("|----------|------|------|----------|-------|---------|--------|------------|--------------|");

  for (const [key, outcomes] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = calcOutcomeStats(outcomes);
    lines.push(`| ${key} | ${s.count} | ${s.same} | ${s.opposite} | ${s.mixed} | ${s.unknown} | ${s.useful} | ${s.misleading} | ${expectationScore(s).toFixed(2)} |`);
  }
  lines.push("");
}

function groupOutcomesByScoreBand(outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>): Map<string, AnalogyOutcomeRecord[]> {
  const groups = new Map<string, AnalogyOutcomeRecord[]>();
  for (const outcome of outcomes) {
    const code = outcome.candidateCode;
    if (!code) continue;
    const scoreEntry = scoreMap.get(`${outcome.createdAt}_${code}`);
    const key = scoreEntry ? scoreBand(scoreEntry.score) : "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(outcome);
  }
  return groups;
}

function groupOutcomesByRules(outcomes: AnalogyOutcomeRecord[], scoreMap: Map<string, ScoreLogEntry>): Map<string, AnalogyOutcomeRecord[]> {
  const groups = new Map<string, AnalogyOutcomeRecord[]>();
  for (const outcome of outcomes) {
    const code = outcome.candidateCode;
    if (!code) continue;
    const scoreEntry = scoreMap.get(`${outcome.createdAt}_${code}`);
    const rules = scoreEntry?.rules?.length ? scoreEntry.rules : ["unknown"];
    for (const rule of rules) {
      if (!groups.has(rule)) groups.set(rule, []);
      groups.get(rule)!.push(outcome);
    }
  }
  return groups;
}

function groupOutcomesByLesson(outcomes: AnalogyOutcomeRecord[]): Map<string, AnalogyOutcomeRecord[]> {
  const groups = new Map<string, AnalogyOutcomeRecord[]>();
  for (const outcome of outcomes) {
    if (!groups.has(outcome.lessonTitle)) groups.set(outcome.lessonTitle, []);
    groups.get(outcome.lessonTitle)!.push(outcome);
  }
  return groups;
}

function main() {
  const today = todayJst();
  const entries = loadScoreLogs();
  const outcomes = loadAnalogyOutcomeRecords();
  const scoreMap = scoreByCodeDate(entries);
  mkdirSync("reports", { recursive: true });

  const lines: string[] = [
    "# alpha-pon 学習レポート",
    "",
    `生成日: ${today}`,
    "",
    "> 過去の daily ログと類推レビュー結果から、ルール・警告・勝率・弱いルールを確認するためのレポートです。",
    "> 買い推奨ではありません。ルール改善と過信防止のために使います。",
    "",
  ];

  if (entries.length === 0) {
    lines.push("スコアログがありません。まず `pnpm daily` または `pnpm daily:mock` を実行してください。");
    writeFileSync(join("reports", `learning_${today}.md`), lines.join("\n"), "utf-8");
    writeFileSync(join("reports", "learning_latest.md"), lines.join("\n"), "utf-8");
    console.log(`レポート: reports/learning_${today}.md`);
    return;
  }

  const warnings = new Map<string, number>();
  const blockers = new Map<string, number>();
  const negativeReasons = new Map<string, number>();
  const hypeReasons = new Map<string, number>();
  const expertDisagreements = new Map<string, number>();
  const expertLensBlocks = new Map<string, number>();
  const expertLensCautions = new Map<string, number>();
  const expertNextChecks = new Map<string, number>();

  for (const entry of entries) {
    for (const w of entry.warnings ?? []) increment(warnings, w);
    for (const b of entry.riskReview?.blockers ?? []) increment(blockers, b);
    for (const n of entry.negativeReasons ?? []) increment(negativeReasons, n);
    for (const h of entry.hypeRisk?.reasons ?? []) increment(hypeReasons, h);
    for (const d of entry.expertReview?.disagreements ?? []) increment(expertDisagreements, d);
    for (const lens of entry.expertReview?.lenses ?? []) {
      if (lens.verdict === "block") increment(expertLensBlocks, lens.name);
      if (lens.verdict === "caution") increment(expertLensCautions, lens.name);
      for (const check of lens.nextChecks ?? []) increment(expertNextChecks, check);
    }
  }

  const total = entries.length;
  const uniqueCodes = new Set(entries.map(e => e.code)).size;
  const urgent = entries.filter(e => e.alertLevel === "urgent").length;
  const daily = entries.filter(e => e.alertLevel === "daily").length;
  const rejected = entries.filter(e => e.riskReview?.decision === "reject").length;
  const highQuality = entries.filter(e => e.riskReview?.decision === "high_quality_candidate").length;
  const expertBlocked = entries.filter(e => e.expertReview?.finalVerdict === "block").length;
  const expertStrong = entries.filter(e => e.expertReview?.finalVerdict === "strong").length;
  const outcomeStats = calcOutcomeStats(outcomes);

  lines.push("## 全体サマリー");
  lines.push("");
  lines.push(`- スコアログ件数: ${total}`);
  lines.push(`- 銘柄数: ${uniqueCodes}`);
  lines.push(`- 即通知: ${urgent}`);
  lines.push(`- 朝まとめ: ${daily}`);
  lines.push(`- 調査前レビューで要確認: ${rejected}`);
  lines.push(`- 高品質候補: ${highQuality}`);
  lines.push(`- 専門家合議 block: ${expertBlocked}`);
  lines.push(`- 専門家合議 strong: ${expertStrong}`);
  lines.push(`- 類推レビュー件数: ${outcomeStats.count}`);
  lines.push(`- same/opposite/mixed/unknown: ${outcomeStats.same}/${outcomeStats.opposite}/${outcomeStats.mixed}/${outcomeStats.unknown}`);
  lines.push(`- 方向性期待値: ${expectationScore(outcomeStats).toFixed(2)}`);
  lines.push("");

  pushGroupTable(lines, "ルール別の傾向", groupBy(entries, e => e.rules?.length ? e.rules : ["unknown"]));
  pushGroupTable(lines, "タグ別の傾向", groupBy(entries, e => e.tags?.length ? e.tags : ["unknown"]));
  pushGroupTable(lines, "優先度別の傾向", groupBy(entries, e => [e.priority ?? "unknown"]));
  pushGroupTable(lines, "調査前レビュー判定別の傾向", groupBy(entries, e => [e.riskReview?.decision ?? "unknown"]));
  pushGroupTable(lines, "専門家合議判定別の傾向", groupBy(entries, e => [e.expertReview?.finalVerdict ?? "unknown"]));

  if (outcomes.length > 0) {
    pushOutcomeTable(lines, "スコア帯別 類推レビュー成績", groupOutcomesByScoreBand(outcomes, scoreMap));
    pushOutcomeTable(lines, "ルール別 類推レビュー成績", groupOutcomesByRules(outcomes, scoreMap));
    pushOutcomeTable(lines, "過去事例別 類推レビュー成績", groupOutcomesByLesson(outcomes));
  }

  lines.push("## 頻出する懸念");
  lines.push("");
  lines.push("### 調査前に止めた理由");
  topEntries(blockers).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### 専門家合議の反対意見");
  topEntries(expertDisagreements).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### block が多い専門家レンズ");
  topEntries(expertLensBlocks).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### caution が多い専門家レンズ");
  topEntries(expertLensCautions).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### よく出る次の確認事項");
  topEntries(expertNextChecks).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### 警告");
  topEntries(warnings).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### 注意点");
  topEntries(negativeReasons).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");
  lines.push("### 流行・FOMO要因");
  topEntries(hypeReasons).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  lines.push("");

  lines.push("## 弱いルール候補");
  lines.push("");
  const ruleGroups = groupOutcomesByRules(outcomes, scoreMap);
  const weakRules = [...ruleGroups.entries()]
    .map(([rule, group]) => ({ rule, stats: calcOutcomeStats(group), exp: expectationScore(calcOutcomeStats(group)) }))
    .filter(item => item.stats.count >= 5 && item.exp < 0)
    .sort((a, b) => a.exp - b.exp);
  if (weakRules.length === 0) {
    lines.push("- 現時点では、十分な件数で明確に弱いルールは未検出です。まだログを貯める段階です。");
  } else {
    weakRules.forEach(item => lines.push(`- ${item.rule}: 件数${item.stats.count}, 方向性期待値${item.exp.toFixed(2)}。弱体化/削除/条件追加を検討。`));
  }
  lines.push("");

  lines.push("## 次の改善候補");
  lines.push("");
  if (topEntries(expertLensBlocks).some(([key]) => key.includes("データ品質"))) lines.push("- データ品質レンズのblockが多い。J-Quants設定、ベンチマークコード、欠損処理を優先確認する。");
  if (topEntries(expertLensBlocks).some(([key]) => key.includes("リスク管理"))) lines.push("- リスク管理レンズのblockが多い。流動性・ボラティリティのしきい値を見直す。");
  if (topEntries(expertLensCautions).some(([key]) => key.includes("品質"))) lines.push("- 品質・バリュー視点のcautionが多い。ROIC/FCF/競争優位スコアの取得率を確認する。");
  if (topEntries(blockers).some(([key]) => key.includes("流動性"))) lines.push("- 流動性で止まる候補が多いので、最低売買代金しきい値の調整を検討する。試験運転では緩めず、まずログを貯める。");
  if (topEntries(blockers).some(([key]) => key.includes("下方修正"))) lines.push("- 下方修正の検出精度を上げる。開示タイトルだけでなく決算短信・会社予想の比較を強化する。");
  if (topEntries(warnings).some(([key]) => key.includes("TOPIX") || key.includes("ベンチマーク"))) lines.push("- 市場ベンチマークコードを見直す。MARKET_BENCHMARK_CODE を実データで取れるコードに変更する。");
  if (topEntries(hypeReasons).length > 0) lines.push("- 流行テーマは買い材料ではなく過熱リスクとして扱い、一次情報・業績・バリュエーション確認を必須化する。");
  lines.push("- スコア帯別・ルール別の方向性期待値を見て、成績が弱いルールは弱体化または削除する。");
  lines.push("- 専門家合議で頻出する反対意見を、次のルール改善・データ追加の優先順位にする。");
  lines.push("");

  lines.push("---");
  lines.push(`*alpha-pon learning | ${today} | ※買い推奨ではありません*`);

  const outputPath = join("reports", `learning_${today}.md`);
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "learning_latest.md"), lines.join("\n"), "utf-8");
  console.log(`レポート: ${outputPath}`);
}

main();
