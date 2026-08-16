import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

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

function readJsonl(path: string): { rows: JsonlRow[]; warning: string | null } {
  const result = readJsonlWithErrors<JsonlRow>(path);
  return {
    rows: result.rows,
    warning: formatReadOnlyJsonlParseWarning(path, result.parseErrors),
  };
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

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function main() {
  const date = todayJst();
  const regime = readYaml<CurrentRegime>("config/current-regime.yml");
  const nonMoveInput = readJsonl("data/company_non_move_history.jsonl");
  const regimeHistoryInput = readJsonl("data/regime_history.jsonl");
  const sourceHealthInput = readJsonl("data/source_health_history.jsonl");
  const nonMove = nonMoveInput.rows;
  const regimeHistory = regimeHistoryInput.rows;
  const sourceHealth = sourceHealthInput.rows;
  const staleReport = readText("reports/stale_hypotheses_latest.md");
  const networkReport = readText("reports/company_network_latest.md");
  const stockProReport = readText("reports/stock_pro_agent_latest.md");
  const stockProSummary = readText("reports/stock_pro_summary_latest.md");
  const pipelineHealthSummary = readText("reports/pipeline_health_summary_latest.md");
  const coverageReport = readText("reports/company_coverage_audit_latest.md");
  const alignmentReport = readText("reports/regime_hypothesis_alignment_latest.md");
  const onboardingReport = readText("reports/company_onboarding_audit_latest.md");
  const qualityReport = readText("reports/stock_pro_quality_audit_latest.md");
  const committeeReport = readText("reports/stock_pro_committee_latest.md");
  const improvementRoadmap = readText("reports/stock_pro_improvement_roadmap_latest.md");
  const proKnowledgeRefresh = readText("reports/pro_knowledge_refresh_latest.md");

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
  const qualityBlocked = countMatches(qualityReport, /\| blocked \|/g);
  const qualityProvisional = countMatches(qualityReport, /\| provisional \|/g);
  const committeeEvidenceShortage = countMatches(committeeReport, /committee decision: \*\*証拠不足\*\*/g);
  const committeeHold = countMatches(committeeReport, /committee decision: \*\*保留\*\*/g);
  const onboardingThin = countMatches(onboardingReport, /unknown_or_thin/g);
  const knowledgeS = countMatches(proKnowledgeRefresh, /\| S \|/g);
  const knowledgeA = countMatches(proKnowledgeRefresh, /\| A \|/g);

  const auditWarnings: string[] = [];
  for (const warning of [nonMoveInput.warning, regimeHistoryInput.warning, sourceHealthInput.warning]) {
    if (warning) auditWarnings.push(`read-only history parse warning: ${warning}`);
  }
  if (containsWarning(pipelineHealthSummary, ["report confidence: low", "report confidence: caution", "missing_or_invalid", "missing_or_empty"])) {
    auditWarnings.push("pipeline health に注意があります。データ取得や生成が弱い日は、銘柄考察よりsource/pipeline修復を優先してください。");
  }
  if (knowledgeS > 0) {
    auditWarnings.push("Pro知識ブラッシュアップでS優先の更新領域があります。政治・戦争・AI・宇宙/Starlink・金利などの前提が古くないか確認してください。");
  }
  if (qualityBlocked > 0 || committeeEvidenceShortage > 0 || onboardingThin > 0) {
    auditWarnings.push("Pro品質/Pro会議で証拠不足があります。IR・決算・総会・財務・バリュエーション・競合を補完するまで強い判断を避けてください。");
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
  const improvementPriority = extractSection(improvementRoadmap, "priority improvements", 18);
  const improvementNextData = extractSection(improvementRoadmap, "next data to collect", 8);
  const knowledgeRefreshQueue = extractSection(proKnowledgeRefresh, "refresh queue", 18);

  const lines: string[] = [];
  lines.push("# alpha-pon strategic advice report");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("> 目的: 世界情勢・歴史・外れ方・DBの古さ・Pro会議・Pro知識更新を踏まえ、AI側から先回りして穴と改善順を指摘する。買い推奨ではありません。");
  lines.push("");

  lines.push("## 今日の前提");
  lines.push("");
  lines.push(`- current regime: ${activeRegimeIds.join(" / ") || "N/A"}`);
  lines.push(`- regime summary: ${regime?.summary ?? "N/A"}`);
  lines.push(`- non-move history rows: ${nonMove.length}`);
  lines.push(`- regime history rows: ${regimeHistory.length}`);
  lines.push(`- source health history rows: ${sourceHealth.length}`);
  lines.push(`- quality blocked: ${qualityBlocked}`);
  lines.push(`- quality provisional: ${qualityProvisional}`);
  lines.push(`- committee 証拠不足: ${committeeEvidenceShortage}`);
  lines.push(`- committee 保留: ${committeeHold}`);
  lines.push(`- onboarding unknown_or_thin: ${onboardingThin}`);
  lines.push(`- pro knowledge S priority: ${knowledgeS}`);
  lines.push(`- pro knowledge A priority: ${knowledgeA}`);
  lines.push("");

  lines.push("## 今日まず見る穴");
  lines.push("");
  if (auditWarnings.length === 0) lines.push("- 大きな未接続/ズレ/退役候補/Pro会議上の証拠不足/知識更新警告は目立ちません。");
  for (const warning of auditWarnings) lines.push(`- ${warning}`);
  lines.push("");

  lines.push("## Pro知識ブラッシュアップからの更新キュー");
  lines.push("");
  if (!proKnowledgeRefresh) {
    lines.push("- pro_knowledge_refresh_latest.md が未生成です。Pro知識ブラッシュアップを確認してください。");
  } else {
    lines.push(`- S priority domains: ${knowledgeS}`);
    lines.push(`- A priority domains: ${knowledgeA}`);
    lines.push("");
    lines.push("### refresh queue");
    if (knowledgeRefreshQueue.length === 0) lines.push("- N/A");
    for (const item of knowledgeRefreshQueue) lines.push(item);
  }
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

  lines.push("## Pro会議・品質監査からの判断");
  lines.push("");
  if (!qualityReport && !committeeReport && !improvementRoadmap) {
    lines.push("- Pro会議/品質監査/改善ロードマップが未生成です。stock-pro系レポートを確認してください。");
  } else {
    lines.push(`- quality blocked: ${qualityBlocked}`);
    lines.push(`- quality provisional: ${qualityProvisional}`);
    lines.push(`- committee 証拠不足: ${committeeEvidenceShortage}`);
    lines.push(`- committee 保留: ${committeeHold}`);
    lines.push(`- onboarding unknown_or_thin: ${onboardingThin}`);
    lines.push("");
    lines.push("### improvement priority");
    if (improvementPriority.length === 0) lines.push("- N/A");
    for (const item of improvementPriority) lines.push(item);
    lines.push("");
    lines.push("### next data to collect");
    if (improvementNextData.length === 0) lines.push("- N/A");
    for (const item of improvementNextData) lines.push(item);
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
  lines.push("1. 大事な判断では必ずPro会議を通す。新規銘柄・格上げ・通知候補・重要IR前後は単独判断しない。");
  lines.push("2. Pro達の知識も固定しない。政治・戦争・AI・宇宙/Starlink・金利・気候・食糧の変化で前提を更新する。");
  lines.push("3. テーマが強い時ほど、銘柄化を急がない。歴史的に、強いテーマは過熱と織り込み済みを生みやすい。");
  lines.push("4. 決算・総会・配当・資本政策は、社会情勢やテーマより先に見る。直近イベントを落とすと考察精度が崩れる。");
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
  lines.push(`- pro_knowledge_refresh_latest.md: ${proKnowledgeRefresh ? "ok" : "missing"}`);
  lines.push(`- pipeline_health_summary_latest.md: ${pipelineHealthSummary ? "ok" : "missing"}`);
  lines.push(`- company_onboarding_audit_latest.md: ${onboardingReport ? "ok" : "missing"}`);
  lines.push(`- stock_pro_quality_audit_latest.md: ${qualityReport ? "ok" : "missing"}`);
  lines.push(`- stock_pro_committee_latest.md: ${committeeReport ? "ok" : "missing"}`);
  lines.push(`- stock_pro_improvement_roadmap_latest.md: ${improvementRoadmap ? "ok" : "missing"}`);
  lines.push(`- stock_pro_agent_latest.md: ${stockProReport ? "ok" : "missing"}`);
  lines.push(`- stock_pro_summary_latest.md: ${stockProSummary ? "ok" : "missing"}`);
  lines.push(`- company_network_latest.md: ${networkReport ? "ok" : "missing"}`);
  lines.push(`- company_coverage_audit_latest.md: ${coverageReport ? "ok" : "missing"}`);
  lines.push(`- regime_hypothesis_alignment_latest.md: ${alignmentReport ? "ok" : "missing"}`);
  lines.push(`- stale_hypotheses_latest.md: ${staleReport ? "ok" : "missing"}`);
  lines.push("");

  lines.push("## 次に人間が見るべきこと");
  lines.push("");
  lines.push("- Pro知識ブラッシュアップでS/A優先の領域がある場合、regime/agent/銘柄仮説の前提を見直す");
  lines.push("- Pro会議で証拠不足/保留が多い銘柄は、結論ではなく不足情報の収集を優先する");
  lines.push("- pipeline confidence が low/caution なら、銘柄考察よりデータ取得・source healthの修復を優先する");
  lines.push("- 決算・総会・配当・資本政策など重要IRイベントが近い銘柄を先に確認する");
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