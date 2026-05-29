// 学習レポート生成
// reports/scores_*.json を読み、ルール・警告・調査前レビューの傾向を集計する
// pnpm learn

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

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
  };
}

function pushGroupTable(lines: string[], title: string, groups: Map<string, ScoreLogEntry[]>): void {
  if (groups.size === 0) return;

  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| グループ | 件数 | 平均スコア | 即通知 | 朝まとめ | ログ | 対象外 | 要確認 | 高品質候補 |");
  lines.push("|----------|------|------------|--------|----------|------|--------|--------|------------|");

  for (const [key, entries] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = calcGroupStats(entries);
    lines.push(`| ${key} | ${s.count} | ${s.avgScore.toFixed(1)} | ${s.urgent} | ${s.daily} | ${s.log} | ${s.ignore} | ${s.reject} | ${s.highQuality} |`);
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
      // 壊れたログはスキップ。daily側で再生成する。
    }
  }

  return entries;
}

function main() {
  const today = todayJst();
  const entries = loadScoreLogs();
  mkdirSync("reports", { recursive: true });

  const lines: string[] = [
    "# alpha-pon 学習レポート",
    "",
    `生成日: ${today}`,
    "",
    "> 過去の daily ログから、ルール・警告・調査前レビューの傾向を確認するためのレポートです。",
    "> 買い推奨ではありません。ルール改善と過信防止のために使います。",
    "",
  ];

  if (entries.length === 0) {
    lines.push("スコアログがありません。まず `pnpm daily` または `pnpm daily:mock` を実行してください。");
    writeFileSync(join("reports", `learning_${today}.md`), lines.join("\n"), "utf-8");
    console.log(`レポート: reports/learning_${today}.md`);
    return;
  }

  const warnings = new Map<string, number>();
  const blockers = new Map<string, number>();
  const negativeReasons = new Map<string, number>();
  const hypeReasons = new Map<string, number>();

  for (const entry of entries) {
    for (const w of entry.warnings ?? []) increment(warnings, w);
    for (const b of entry.riskReview?.blockers ?? []) increment(blockers, b);
    for (const n of entry.negativeReasons ?? []) increment(negativeReasons, n);
    for (const h of entry.hypeRisk?.reasons ?? []) increment(hypeReasons, h);
  }

  const total = entries.length;
  const uniqueCodes = new Set(entries.map(e => e.code)).size;
  const urgent = entries.filter(e => e.alertLevel === "urgent").length;
  const daily = entries.filter(e => e.alertLevel === "daily").length;
  const rejected = entries.filter(e => e.riskReview?.decision === "reject").length;
  const highQuality = entries.filter(e => e.riskReview?.decision === "high_quality_candidate").length;

  lines.push("## 全体サマリー");
  lines.push("");
  lines.push(`- ログ件数: ${total}`);
  lines.push(`- 銘柄数: ${uniqueCodes}`);
  lines.push(`- 即通知: ${urgent}`);
  lines.push(`- 朝まとめ: ${daily}`);
  lines.push(`- 調査前レビューで要確認: ${rejected}`);
  lines.push(`- 高品質候補: ${highQuality}`);
  lines.push("");

  pushGroupTable(lines, "ルール別の傾向", groupBy(entries, e => e.rules?.length ? e.rules : ["unknown"]));
  pushGroupTable(lines, "タグ別の傾向", groupBy(entries, e => e.tags?.length ? e.tags : ["unknown"]));
  pushGroupTable(lines, "優先度別の傾向", groupBy(entries, e => [e.priority ?? "unknown"]));
  pushGroupTable(lines, "調査前レビュー判定別の傾向", groupBy(entries, e => [e.riskReview?.decision ?? "unknown"]));

  lines.push("## 頻出する懸念");
  lines.push("");
  lines.push("### 調査前に止めた理由");
  topEntries(blockers).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
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

  lines.push("## 次の改善候補");
  lines.push("");
  if (topEntries(blockers).some(([key]) => key.includes("流動性"))) {
    lines.push("- 流動性で止まる候補が多いので、最低売買代金しきい値の調整を検討する。");
  }
  if (topEntries(blockers).some(([key]) => key.includes("下方修正"))) {
    lines.push("- 下方修正の検出精度を上げる。開示タイトルだけでなく決算短信・会社予想の比較を強化する。");
  }
  if (topEntries(warnings).some(([key]) => key.includes("TOPIX") || key.includes("ベンチマーク"))) {
    lines.push("- 市場ベンチマークコードを見直す。MARKET_BENCHMARK_CODE を実データで取れるコードに変更する。");
  }
  if (topEntries(hypeReasons).length > 0) {
    lines.push("- 流行テーマは買い材料ではなく過熱リスクとして扱い、一次情報・業績・バリュエーション確認を必須化する。");
  }
  lines.push("- `pnpm backtest` とこの学習レポートを見比べ、成績が弱いルールは弱体化または削除する。");
  lines.push("");

  lines.push("---");
  lines.push(`*alpha-pon learning | ${today} | ※買い推奨ではありません*`);

  const outputPath = join("reports", `learning_${today}.md`);
  writeFileSync(outputPath, lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "learning_latest.md"), lines.join("\n"), "utf-8");
  console.log(`レポート: ${outputPath}`);
}

main();
