import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type CurrentRegime = {
  asOf?: string;
  mode?: string;
  summary?: string;
  activeRegimes?: Array<{ id: string; level: string; why: string; watchCategories?: string[]; caution?: string[] }>;
};

type JsonlRow = Record<string, unknown>;

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readJsonl(path: string): JsonlRow[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as JsonlRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is JsonlRow => row !== null);
}

function readYaml<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return load(readFileSync(path, "utf-8")) as T;
}

function topCounts(rows: JsonlRow[], key: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (Array.isArray(value)) {
      for (const item of value) counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
    } else if (value != null) {
      counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function containsWarning(text: string, patterns: string[]): boolean {
  return patterns.some(pattern => text.includes(pattern));
}

function extractSection(text: string, title: string, maxLines = 12): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.trim() === `## ${title}`);
  if (start < 0) return [];
  const picked: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    const trimmed = line.trim();
    if (trimmed) picked.push(trimmed);
    if (picked.length >= maxLines) break;
  }
  return picked;
}

function main() {
  const date = todayJst();
  const regime = readYaml<CurrentRegime>("config/current-regime.yml");
  const nonMove = readJsonl("data/company_non_move_history.jsonl");
  const regimeHistory = readJsonl("data/regime_history.jsonl");
  const sourceHealth = readJsonl("data/source_health_history.jsonl");
  const staleReport = readText("reports/stale_hypotheses_latest.md");
  const networkReport = readText("reports/company_network_latest.md");
  const stockProReport = readText("reports/stock_pro_agent_latest.md");
  const stockProSummary = readText("reports/stock_pro_summary_latest.md");
  const pipelineHealthSummary = readText("reports/pipeline_health_summary_latest.md");
  const coverageReport = readText("reports/company_coverage_audit_latest.md");
  const alignmentReport = readText("reports/regime_hypothesis_alignment_latest.md");

  const activeRegimeIds = regime?.activeRegimes?.map(item => item.id) ?? [];
  const nonMoveReasonCounts = topCounts(nonMove, "nonMoveReasons").slice(0, 8);
  const regimeCounts = new Map<string, number>();
  for (const row of regimeHistory) {
    const active = row.activeRegimes;
    if (Array.isArray(active)) {
      for (const item of active) {
        if (item && typeof item === "object" && "id" in item) {
          const id = String((item as { id?: unknown }).id ?? "unknown");
          regimeCounts.set(id, (regimeCounts.get(id) ?? 0) + 1);
        }
      }
    }
  }
  const regimeTop = [...regimeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const auditWarnings: string[] = [];
  if (containsWarning(pipelineHealthSummary, ["report confidence: low", "report confidence: caution", "missing_or_invalid", "missing_or_empty"])) {
    auditWarnings.push("pipeline health に注意があります。データ取得や生成が弱い日は、銘柄考察よりsource/pipeline修復を優先してください。");
  }
  if (containsWarning(stockProSummary, ["安全側ラベルが多い", "company-network未登録", "better peer risk", "一次情報不足", "過熱/織り込み済み"])) {
    auditWarnings.push("stock pro summary に安全側警告があります。今日は調査候補を増やすより、追わない/保留理由の確認を優先してください。");
  }
  if (containsWarning(coverageReport, ["hypothesis missing network: 0\n", "- none"]) === false && coverageReport) {
    auditWarnings.push("company coverage に未接続があります。仮説DBとネットワークDBの片手落ちを確認してください。 注意: 自動判定が粗い場合があります。");
  }
  if (containsWarning(alignmentReport, ["current regime 外", "監視対象外", "active but thin"])) {
    auditWarnings.push("current regime と銘柄仮説にズレがあります。無理に追わず、保留/追わない判断を優先してください。");
  }
  if (containsWarning(staleReport, ["review_repeated_miss", "retire_or_rewrite", "missing_review_date", "review_needed"])) {
    auditWarnings.push("stale / retired 候補があります。古い仮説や繰り返し外れた仮説を放置しないでください。");
  }

  const stockSummaryJudgment = extractSection(stockProSummary, "summary judgment", 8);
  const stockRiskCounters = extractSection(stockProSummary, "risk counters", 8);
  const pipelineConfidence = extractSection(pipelineHealthSummary, "confidence", 8);
  const pipelineCriticalSignals = extractSection(pipelineHealthSummary, "critical signals", 8);

  const lines: string[] = [];
  lines.push("# alpha-pon strategic advice report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("> 目的: 世界情勢・歴史・外れ方・DBの古さを踏まえ、AI側から先回りして穴を指摘する。買い推奨ではありません。");
  lines.push("");

  lines.push("## 今日の前提");
  lines.push("");
  lines.push(`- current regime: ${activeRegimeIds.join(" / ") || "N/A"}`);
  lines.push(`- regime summary: ${regime?.summary ?? "N/A"}`);
  lines.push(`- non-move history rows: ${nonMove.length}`);
  lines.push(`- regime history rows: ${regimeHistory.length}`);
  lines.push(`- source health history rows: ${sourceHealth.length}`);
  lines.push("");

  lines.push("## 今日まず見る穴");
  lines.push("");
  if (auditWarnings.length === 0) lines.push("- 大きな未接続/ズレ/退役候補の警告は目立ちません。");
  for (const warning of auditWarnings) lines.push(`- ${warning}`);
  lines.push("");

  lines.push("## pipeline health からの信頼度判断");
  lines.push("");
  if (pipelineConfidence.length === 0 && pipelineCriticalSignals.length === 0) {
    lines.push("- pipeline_health_summary_latest.md が未生成または空です。pipeline-health-summary を確認してください。");
  } else {
    for (const item of pipelineConfidence) lines.push(item);
    if (pipelineCriticalSignals.length > 0) {
      lines.push("");
      lines.push("### critical signals");
      for (const item of pipelineCriticalSignals) lines.push(item);
    }
  }
  lines.push("");

  lines.push("## stock pro summary からの朝一判断");
  lines.push("");
  if (stockSummaryJudgment.length === 0 && stockRiskCounters.length === 0) {
    lines.push("- stock_pro_summary_latest.md が未生成または空です。stock-pro-summary を確認してください。");
  } else {
    for (const item of stockSummaryJudgment) lines.push(item);
    if (stockRiskCounters.length > 0) {
      lines.push("");
      lines.push("### risk counters");
      for (const item of stockRiskCounters) lines.push(item);
    }
  }
  lines.push("");

  lines.push("## AIからの先回り指摘");
  lines.push("");
  lines.push("1. テーマが強い時ほど、銘柄化を急がない。歴史的に、強いテーマは過熱と織り込み済みを生みやすい。");
  lines.push("2. 今年うまくいったテーマは、来年の弱点になる可能性がある。年次レビューでは必ず反転リスクを見る。");
  lines.push("3. 災害・戦争・食糧・移民・気候は、直接銘柄よりも周辺コスト・供給制約・規制変更として効く場合が多い。");
  lines.push("4. 具体銘柄を出すより先に、追わない理由を出す。追わない判断は失敗ではなくリスク管理。");
  lines.push("5. DBが増えたら精度が上がるとは限らない。古い仮説・使われないDB・重複DBは退役候補にする。");
  lines.push("");

  lines.push("## 外れ理由から見た警告");
  lines.push("");
  if (nonMoveReasonCounts.length === 0) {
    lines.push("- まだ外れ理由DBが薄い。レビュー結果から company_non_move_history.jsonl を育てる必要があります。");
  } else {
    for (const [reason, count] of nonMoveReasonCounts) lines.push(`- ${count}件: ${reason}`);
  }
  lines.push("");

  lines.push("## 情勢履歴から見た偏り");
  lines.push("");
  if (regimeTop.length === 0) {
    lines.push("- regime history が薄い。数週間分が貯まるまでは、時代認識の偏り判定は保留。");
  } else {
    for (const [id, count] of regimeTop) lines.push(`- ${count}回: ${id}`);
  }
  lines.push("");

  lines.push("## レポート接続チェック");
  lines.push("");
  lines.push(`- pipeline_health_summary_latest.md: ${pipelineHealthSummary ? "ok" : "missing"}`);
  lines.push(`- stock_pro_agent_latest.md: ${stockProReport ? "ok" : "missing"}`);
  lines.push(`- stock_pro_summary_latest.md: ${stockProSummary ? "ok" : "missing"}`);
  lines.push(`- company_network_latest.md: ${networkReport ? "ok" : "missing"}`);
  lines.push(`- company_coverage_audit_latest.md: ${coverageReport ? "ok" : "missing"}`);
  lines.push(`- regime_hypothesis_alignment_latest.md: ${alignmentReport ? "ok" : "missing"}`);
  lines.push(`- stale_hypotheses_latest.md: ${staleReport ? "ok" : "missing"}`);
  lines.push("");

  lines.push("## 次に人間が見るべきこと");
  lines.push("");
  lines.push("- pipeline confidence が low/caution なら、銘柄考察よりデータ取得・source healthの修復を優先する");
  lines.push("- stock pro summary で、追わない/保留・証拠不足・避けるが多すぎないか");
  lines.push("- stock pro report と company network report が同じ銘柄で矛盾していないか");
  lines.push("- company coverage audit で未接続銘柄が残っていないか");
  lines.push("- regime alignment で current regime 外の銘柄を追いすぎていないか");
  lines.push("- stale_hypotheses_latest.md の review_needed を放置していないか");
  lines.push("- 追う銘柄より、追わない銘柄を明確にできているか");
  lines.push("");

  lines.push("## 判断ラベルの原則");
  lines.push("");
  lines.push("- 調査候補: 証拠はあるが、買い判断ではない");
  lines.push("- 保留: テーマはあるが、価格・証拠・財務・需給のどれかが足りない");
  lines.push("- 証拠不足: 一次情報や価格データが足りない");
  lines.push("- 避ける: 低品質・希薄化・不祥事・過熱・流動性不足が強い");
  lines.push("- 追わない: テーマはあるが、今は人間の注意資源を使う価値が低い");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon strategic advice | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "strategic_advice_latest.md"), lines.join("\n"), "utf-8");
  console.log("strategic advice report generated");
}

main();
