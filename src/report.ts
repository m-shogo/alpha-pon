import type { ScoreResult, AlertLevel } from "./types.js";

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

  if (result.dataQuality !== "ok") {
    blockers.push(`データ品質が ${result.dataQuality}`);
  }

  if (result.alertLevel === "log") {
    blockers.push("通知レベルがログ記録");
  }

  if (result.alertLevel === "ignore") {
    blockers.push("通知対象外スコア");
  }

  for (const warning of result.warnings) {
    if (
      warning.includes("通知対象") ||
      warning.includes("未設定") ||
      warning.includes("不足") ||
      warning.includes("特定できません") ||
      warning.includes("暫定利用")
    ) {
      blockers.push(warning);
    }
  }

  return [...new Set(blockers)];
}

export function generateReport(result: ScoreResult): string {
  const { candidate } = result;
  const lines: string[] = [];

  lines.push(`# 【調査候補】${candidate.code} ${candidate.name}`);
  lines.push("");
  lines.push(`> ※これは買い推奨ではありません。調査候補です。`);
  lines.push("");
  lines.push(`**スコア: ${result.score} / 100**  `);
  lines.push(`通知レベル: ${ALERT_LABELS[result.alertLevel]}  `);
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

  lines.push("## スコア内訳");
  lines.push("");
  lines.push("| カテゴリ     | スコア | バー       |");
  lines.push("|------------|--------|------------|");
  lines.push(formatBreakdown(result));
  lines.push("");

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

  lines.push(`# alpha-pon 調査候補レポート`);
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

  lines.push(`## サマリー`);
  lines.push("");
  lines.push(`- 🚨 即通知: **${urgent.length}件**`);
  lines.push(`- 📋 朝まとめ: **${daily.length}件**`);
  lines.push(`- 📝 ログ: **${log.length}件**`);
  lines.push(`- ➖ 対象外: **${ignored.length}件**`);
  lines.push(`- ⚠️ 通知抑制・弱められた候補: **${blocked.length}件**`);
  lines.push("");

  const notifiable = [...urgent, ...daily];
  if (notifiable.length > 0) {
    lines.push("## 通知対象");
    lines.push("");
    lines.push("| コード | 銘柄名 | スコア | レベル | 主な検出理由 |");
    lines.push("|--------|--------|--------|--------|------------|");
    for (const r of notifiable) {
      const topReason = r.reasons[0] ?? "-";
      const level = r.alertLevel === "urgent" ? "🚨" : "📋";
      lines.push(`| ${r.candidate.code} | ${r.candidate.name} | ${r.score} | ${level} | ${topReason} |`);
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
    lines.push(`### ${icon} ${r.candidate.code} ${r.candidate.name} — ${r.score}点`);
    lines.push("");
    if (r.reasons.length > 0) {
      r.reasons.slice(0, 3).forEach(reason => lines.push(`- ${reason}`));
    }
    if (r.negativeReasons.length > 0) {
      lines.push(`- ⚠️ ${r.negativeReasons[0]}`);
    }
    const blockers = notificationBlockers(r);
    if (blockers.length > 0) {
      lines.push(`- 🛑 ${blockers[0]}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon v0.1 | ${date} | ※買い推奨ではありません*`);

  return lines.join("\n");
}
