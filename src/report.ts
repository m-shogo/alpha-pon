import type { ScoreResult, AlertLevel, ExpertVerdict } from "./types.js";
import { findRelatedMarketLessonsForScore } from "./analysis/market-lesson-links.js";

const ALERT_LABELS: Record<AlertLevel, string> = {
  urgent: "🚨 即通知 (URGENT)",
  daily: "📋 朝まとめ (DAILY)",
  log: "📝 ログ記録 (LOG)",
  ignore: "➖ 対象外 (IGNORE)",
};

const PRIORITY_LABELS: Record<string, string> = {
  S: "S（最優先）",
  A: "A（優先）",
  B: "B（通常）",
  C: "C（低優先）",
};

function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function fmtPt(value: number | null | undefined, digits = 1): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}pt`;
}

function fmtYen(value: number | null | undefined): string {
  if (value == null) return "N/A";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}億円`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}万円`;
  return `${Math.round(value).toLocaleString()}円`;
}

function decisionLabel(decision: string | undefined): string {
  switch (decision) {
    case "reject": return "🛑 要確認";
    case "research_only": return "🔎 調査のみ";
    case "watch": return "👀 監視候補";
    case "high_quality_candidate": return "✅ 高品質候補";
    default: return "N/A";
  }
}

function expertVerdictLabel(verdict: ExpertVerdict | undefined): string {
  switch (verdict) {
    case "block": return "🛑 block";
    case "caution": return "⚠️ caution";
    case "pass": return "✅ pass";
    case "strong": return "💎 strong";
    default: return "N/A";
  }
}

function formatBreakdown(result: ScoreResult): string {
  const { breakdown } = result;
  const rows = [
    ["構造イベント", breakdown.structuralEvent, 30],
    ["需給改善", breakdown.supplyDemand, 25],
    ["割安感", breakdown.valuation, 15],
    ["テーマ性", breakdown.theme, 15],
    ["業績安全性", breakdown.businessSafety, 10],
    ["AI評価", breakdown.aiReview, 5],
  ] as const;

  return rows.map(([label, score, max]) => {
    const bar = "█".repeat(Math.round((score / max) * 10)).padEnd(10, "░");
    return `| ${label.padEnd(10)} | ${String(score).padStart(2)}/${max} | ${bar} |`;
  }).join("\n");
}

function notificationBlockers(result: ScoreResult): string[] {
  const blockers: string[] = [];

  if (result.dataQuality !== "ok") blockers.push(`データ品質が ${result.dataQuality}`);
  if (result.alertLevel === "log") blockers.push("通知レベルがログ記録");
  if (result.alertLevel === "ignore") blockers.push("通知対象外スコア");

  for (const warning of result.warnings) {
    if (
      warning.includes("通知対象") ||
      warning.includes("未設定") ||
      warning.includes("不足") ||
      warning.includes("特定できません") ||
      warning.includes("暫定利用") ||
      warning.includes("流動性") ||
      warning.includes("ボラティリティ") ||
      warning.includes("過熱") ||
      warning.includes("FOMO")
    ) blockers.push(warning);
  }

  if (result.riskReview?.blockers.length) blockers.push(...result.riskReview.blockers);
  if (result.expertReview?.finalVerdict === "block") {
    blockers.push(...result.expertReview.requiredBeforeNotification);
  }

  return [...new Set(blockers)];
}

function pushResearchReview(lines: string[], result: ScoreResult): void {
  const review = result.riskReview;
  if (!review) return;

  lines.push("## 調査前レビュー");
  lines.push("");
  lines.push(`判定: **${decisionLabel(review.decision)}**`);
  lines.push("");
  lines.push("| チェック | 結果 |");
  lines.push("|----------|------|");
  for (const [key, value] of Object.entries(review.checklist)) {
    lines.push(`| ${key} | ${value ? "OK" : "要確認"} |`);
  }
  lines.push("");

  if (review.blockers.length > 0) {
    lines.push("### 先に確認する懸念");
    review.blockers.forEach(b => lines.push(`- 🛑 ${b}`));
    lines.push("");
  }

  if (review.warnings.length > 0) {
    lines.push("### 追加確認");
    review.warnings.slice(0, 6).forEach(w => lines.push(`- ⚠️ ${w}`));
    lines.push("");
  }

  if (review.strengths.length > 0) {
    lines.push("### 強み候補");
    review.strengths.forEach(s => lines.push(`- ${s}`));
    lines.push("");
  }
}

function pushExpertReview(lines: string[], result: ScoreResult): void {
  const review = result.expertReview;
  if (!review) return;

  lines.push("## 専門家レンズ合議");
  lines.push("");
  lines.push(`最終判定: **${expertVerdictLabel(review.finalVerdict)}**  `);
  lines.push(`合意スコア: **${review.consensusScore}/100**  `);
  lines.push(`strong: ${review.strongCount} / pass: ${review.passCount} / caution: ${review.cautionCount} / block: ${review.blockCount}`);
  lines.push("");

  if (review.requiredBeforeNotification.length > 0) {
    lines.push("### 通知前に必要な確認");
    review.requiredBeforeNotification.forEach(item => lines.push(`- 🛑 ${item}`));
    lines.push("");
  }

  lines.push("### レンズ別判定");
  lines.push("");
  lines.push("| レンズ | 判定 | 信頼度 | 主な理由 | 反対意見 |");
  lines.push("|--------|------|--------|----------|----------|");
  for (const lens of review.lenses) {
    const reason = lens.reasons[0] ?? "-";
    const objection = lens.objections[0] ?? "-";
    lines.push(`| ${lens.name} | ${expertVerdictLabel(lens.verdict)} | ${(lens.confidence * 100).toFixed(0)}% | ${reason} | ${objection} |`);
  }
  lines.push("");
}

function pushRelatedLessons(lines: string[], result: ScoreResult): void {
  const lessons = findRelatedMarketLessonsForScore(result, 3);
  if (lessons.length === 0) return;

  lines.push("## 関連する過去事例（参考・スコア加点なし）");
  lines.push("");
  lines.push("> 過去事例は“今回も同じになる”という意味ではありません。似た型を思い出し、反証条件と一次情報チェックを増やすための参考です。");
  lines.push("");
  for (const match of lessons) {
    const lesson = match.lesson;
    lines.push(`### ${lesson.title}`);
    lines.push("");
    lines.push(`- 型: ${lesson.category} / ${lesson.direction}`);
    lines.push(`- 一言: ${lesson.shortSummary}`);
    lines.push(`- 使える学び: ${lesson.usefulTakeaways[0] ?? "-"}`);
    lines.push(`- 今回の確認: ${lesson.modernAnalogyQuestions[0] ?? "-"}`);
    lines.push(`- 一次情報: ${lesson.primaryChecks.slice(0, 4).join(", ")}`);
    lines.push("");
  }
}

function pushHypeRisk(lines: string[], result: ScoreResult): void {
  const hype = result.hypeRisk;
  if (!hype) return;

  lines.push("## 流行・過熱リスク");
  lines.push("");
  lines.push(`過熱リスク: **${hype.level} (${hype.score}/100)**`);
  lines.push("");
  hype.reasons.forEach(r => lines.push(`- ${r}`));
  hype.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
  lines.push("");
}

function pushMarketContext(lines: string[], result: ScoreResult): void {
  const m = result.marketContext;
  if (!m) return;

  lines.push("## 市場文脈");
  lines.push("");
  lines.push("| 項目 | 値 |");
  lines.push("|------|----|");
  lines.push(`| 5日リターン | ${fmtPct(m.return5d)} |`);
  lines.push(`| 20日リターン | ${fmtPct(m.return20d)} |`);
  lines.push(`| 60日リターン | ${fmtPct(m.return60d)} |`);
  lines.push(`| ベンチマーク20日リターン | ${fmtPct(m.topixReturn20d)} |`);
  lines.push(`| ベンチマーク比20日 | ${fmtPt(m.relativeToTopix20d)} |`);
  lines.push(`| 20日平均売買代金 | ${fmtYen(m.liquidityYen20d)} |`);
  lines.push(`| 20日ボラティリティ | ${fmtPct(m.volatility20d)} |`);
  lines.push("");
}

function pushFinancialQuality(lines: string[], result: ScoreResult): void {
  const f = result.financialQuality;
  if (!f) return;

  lines.push("## 財務品質");
  lines.push("");
  lines.push(`財務品質スコア: **${f.qualityScore} / 10**`);
  lines.push("");
  lines.push("| 項目 | 値 |");
  lines.push("|------|----|");
  lines.push(`| 売上前年比 | ${fmtPct(f.revenueYoY)} |`);
  lines.push(`| 営業利益前年比 | ${fmtPct(f.operatingProfitYoY)} |`);
  lines.push(`| 営業利益率 | ${fmtPct(f.operatingMargin)} |`);
  lines.push(`| 営業利益率前年差 | ${fmtPt(f.operatingMarginYoY)} |`);
  lines.push(`| 売上予想進捗率 | ${fmtPct(f.forecastRevenueProgressRate)} |`);
  lines.push(`| 営業利益予想進捗率 | ${fmtPct(f.forecastOperatingProfitProgressRate)} |`);
  lines.push(`| 下方修正検出 | ${f.hasDownwardRevision == null ? "N/A" : f.hasDownwardRevision ? "あり" : "なし"} |`);
  lines.push("");
}

export function generateReport(result: ScoreResult): string {
  const { candidate } = result;
  const lines: string[] = [];

  lines.push(`# 【調査候補】${candidate.code} ${candidate.name}`);
  lines.push("");
  lines.push("> ※これは買い推奨ではありません。調査候補です。");
  lines.push("");
  lines.push(`**スコア: ${result.score} / 100**  `);
  lines.push(`通知レベル: ${ALERT_LABELS[result.alertLevel]}  `);
  lines.push(`調査前判定: ${decisionLabel(result.riskReview?.decision)}  `);
  lines.push(`専門家合議: ${expertVerdictLabel(result.expertReview?.finalVerdict)} (${result.expertReview?.consensusScore ?? "N/A"}/100)  `);
  lines.push(`優先度: ${PRIORITY_LABELS[candidate.priority] ?? candidate.priority}  `);
  lines.push(`ステータス: ${candidate.status}  `);
  lines.push(`作成日: ${result.createdAt}  `);
  lines.push(`データ品質: ${result.dataQuality}`);
  lines.push("");

  const blockers = notificationBlockers(result);
  if (blockers.length > 0) {
    lines.push("## 通知されなかった・弱められた理由");
    lines.push("");
    blockers.forEach(reason => lines.push(`- ${reason}`));
    lines.push("");
  }

  pushResearchReview(lines, result);
  pushExpertReview(lines, result);
  pushRelatedLessons(lines, result);

  lines.push("## スコア内訳");
  lines.push("");
  lines.push("| カテゴリ | スコア | バー |");
  lines.push("|----------|--------|------|");
  lines.push(formatBreakdown(result));
  lines.push("");

  pushHypeRisk(lines, result);
  pushMarketContext(lines, result);
  pushFinancialQuality(lines, result);

  if (result.reasons.length > 0) {
    lines.push("## 検出理由");
    lines.push("");
    result.reasons.forEach(r => lines.push(`- ${r}`));
    lines.push("");
  }

  if (result.negativeReasons.length > 0) {
    lines.push("## 注意点");
    lines.push("");
    result.negativeReasons.forEach(r => lines.push(`- ${r}`));
    lines.push("");
  }

  if (result.nextSteps.length > 0) {
    lines.push("## 次に見るもの");
    lines.push("");
    result.nextSteps.forEach(s => lines.push(`- [ ] ${s}`));
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("## 警告");
    lines.push("");
    result.warnings.forEach(w => lines.push(`- ⚠️ ${w}`));
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon v0.1 | ${result.createdAt} | ※買い推奨ではありません*`);

  return lines.join("\n");
}

export function generateSummaryReport(results: ScoreResult[], date: string): string {
  const lines: string[] = [];

  lines.push("# alpha-pon 調査候補レポート");
  lines.push("");
  lines.push(`作成日: ${date}`);
  lines.push("");
  lines.push("> ※これは買い推奨ではありません。調査候補のまとめです。");
  lines.push("");

  const urgent = results.filter(r => r.alertLevel === "urgent");
  const daily = results.filter(r => r.alertLevel === "daily");
  const log = results.filter(r => r.alertLevel === "log");
  const ignored = results.filter(r => r.alertLevel === "ignore");
  const blocked = results.filter(r => notificationBlockers(r).length > 0);
  const reviewStops = results.filter(r => r.riskReview?.decision === "reject");
  const expertBlocks = results.filter(r => r.expertReview?.finalVerdict === "block");

  lines.push("## サマリー");
  lines.push("");
  lines.push(`- 🚨 即通知: **${urgent.length}件**`);
  lines.push(`- 📋 朝まとめ: **${daily.length}件**`);
  lines.push(`- 📝 ログ: **${log.length}件**`);
  lines.push(`- ➖ 対象外: **${ignored.length}件**`);
  lines.push(`- ⚠️ 通知抑制・弱められた候補: **${blocked.length}件**`);
  lines.push(`- 🛑 調査前レビューで要確認: **${reviewStops.length}件**`);
  lines.push(`- 🧠 専門家合議でblock: **${expertBlocks.length}件**`);
  lines.push("");

  const notifiable = [...urgent, ...daily];
  if (notifiable.length > 0) {
    lines.push("## 通知対象");
    lines.push("");
    lines.push("| コード | 銘柄名 | スコア | レベル | 専門家合議 | 調査判定 | 過熱 | ベンチマーク比20日 | 財務品質 | 主な検出理由 |");
    lines.push("|--------|--------|--------|--------|------------|----------|------|------------------|----------|--------------|");
    for (const r of notifiable) {
      const topReason = r.reasons[0] ?? "-";
      const level = r.alertLevel === "urgent" ? "🚨" : "📋";
      lines.push(`| ${r.candidate.code} | ${r.candidate.name} | ${r.score} | ${level} | ${expertVerdictLabel(r.expertReview?.finalVerdict)} ${r.expertReview?.consensusScore ?? "N/A"}/100 | ${decisionLabel(r.riskReview?.decision)} | ${r.hypeRisk?.level ?? "N/A"} | ${fmtPt(r.marketContext?.relativeToTopix20d)} | ${r.financialQuality?.qualityScore ?? "N/A"}/10 | ${topReason} |`);
    }
    lines.push("");
  }

  if (blocked.length > 0) {
    lines.push("## 通知されなかった・弱められた候補");
    lines.push("");
    lines.push("| コード | 銘柄名 | Lv | 主な理由 |");
    lines.push("|--------|--------|----|----------|");
    for (const r of blocked) {
      const reason = notificationBlockers(r)[0] ?? "-";
      const icon = ALERT_LABELS[r.alertLevel].split(" ")[0];
      lines.push(`| ${r.candidate.code} | ${r.candidate.name} | ${icon} | ${reason} |`);
    }
    lines.push("");
  }

  lines.push("## 全銘柄スコア");
  lines.push("");
  for (const r of results) {
    const icon = ALERT_LABELS[r.alertLevel].split(" ")[0];
    const lesson = findRelatedMarketLessonsForScore(r, 1)[0];
    lines.push(`### ${icon} ${r.candidate.code} ${r.candidate.name} — ${r.score}点`);
    lines.push("");
    lines.push(`- 専門家合議: ${expertVerdictLabel(r.expertReview?.finalVerdict)} (${r.expertReview?.consensusScore ?? "N/A"}/100)`);
    lines.push(`- 調査前判定: ${decisionLabel(r.riskReview?.decision)}`);
    if (r.hypeRisk) lines.push(`- 流行/過熱リスク: ${r.hypeRisk.level} (${r.hypeRisk.score}/100)`);
    if (r.marketContext) lines.push(`- 市場文脈: ベンチマーク比20日 ${fmtPt(r.marketContext.relativeToTopix20d)} / 20日平均売買代金 ${fmtYen(r.marketContext.liquidityYen20d)}`);
    if (r.financialQuality) lines.push(`- 財務品質: ${r.financialQuality.qualityScore}/10`);
    if (lesson) lines.push(`- 参考事例: ${lesson.lesson.title}（スコア加点なし）`);
    r.reasons.slice(0, 3).forEach(reason => lines.push(`- ${reason}`));
    if (r.negativeReasons.length > 0) lines.push(`- ⚠️ ${r.negativeReasons[0]}`);
    const blockers = notificationBlockers(r);
    if (blockers.length > 0) lines.push(`- 🛑 ${blockers[0]}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon v0.1 | ${date} | ※買い推奨ではありません*`);

  return lines.join("\n");
}
