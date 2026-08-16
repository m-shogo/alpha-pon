// world_theme_candidate_hypotheses.jsonl から、30/90/180日後の答え合わせ待ちを出す。
// 買い推奨ではなく、仮説が一次情報・価格反応・業績に接続したかを後で確認するためのレポート。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  readWorldThemeCandidateReviewInput,
  type PersistedWorldThemeCandidateHypothesis,
} from "./world-theme-candidate-review-input.js";
import { isValidWorldThemeReviewDueDate } from "./world-theme-review-date.js";

type DueItem = {
  hypothesisId: string;
  dueAt: string;
  afterDays: 30 | 90 | 180;
  detectedAt: string;
  sourceEventTitle: string;
  theme: string;
  candidateCode: string;
  candidateCompany: string;
  nextPrimaryCheck: string;
  checkQuestions: string[];
};

function dueItems(rows: PersistedWorldThemeCandidateHypothesis[], today: string): DueItem[] {
  return rows.flatMap(row => row.reviewDueDates
    .filter(due => due.status === "open" && isValidWorldThemeReviewDueDate(due.dueAt) && due.dueAt <= today)
    .map(due => ({
      hypothesisId: row.hypothesisId,
      dueAt: due.dueAt,
      afterDays: due.afterDays,
      detectedAt: row.detectedAt,
      sourceEventTitle: row.sourceEventTitle,
      theme: row.theme,
      candidateCode: row.candidateCode,
      candidateCompany: row.candidateCompany,
      nextPrimaryCheck: row.nextPrimaryCheck,
      checkQuestions: [
        "一次情報に実需・受注・利益率への接続が出たか？",
        "テーマだけでなく、この会社固有の材料に落ちたか？",
        "織り込み済み・地合い連動・個別悪材料で仮説が弱くなっていないか？",
      ],
    })));
}

function renderMarkdown(today: string, total: number, due: DueItem[], inputWarnings: string[]): string {
  return [
    "# 世界情勢候補仮説 レビュー待ち",
    "",
    `date: ${today}`,
    "",
    "> 買い推奨ではありません。世界情勢から作った調査仮説の答え合わせ用です。",
    "",
    "## summary",
    "",
    `- totalHypotheses: ${total}`,
    `- dueReviews: ${due.length}`,
    `- inputWarnings: ${inputWarnings.length}`,
    "",
    ...(inputWarnings.length > 0 ? [
      "## input warnings",
      "",
      ...inputWarnings.map(warning => `- ${warning}`),
      "",
    ] : []),
    "## due reviews",
    "",
    ...(due.length > 0 ? due.map(item => [
      `### ${item.candidateCode} ${item.candidateCompany} / ${item.theme}`,
      `- dueAt: ${item.dueAt} (${item.afterDays}日後レビュー)`,
      `- sourceEvent: ${item.sourceEventTitle}`,
      `- nextPrimaryCheck: ${item.nextPrimaryCheck}`,
      `- check: ${item.checkQuestions.join(" / ")}`,
      "",
    ].join("\n")) : ["- レビュー期限到来なし"]),
    "---",
    "※『評価される可能性があったか』を後で確認するための運用メモ。売買判断ではありません。",
  ].join("\n");
}

function main(): void {
  const today = todayJst();
  const input = readWorldThemeCandidateReviewInput("data/world_theme_candidate_hypotheses.jsonl");
  const rows = input.rows;
  const due = dueItems(rows, today).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const inputWarnings = input.warning ? [input.warning] : [];

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/world_theme_candidate_review_latest.json",
    JSON.stringify({ generatedAt: today, totalHypotheses: rows.length, dueReviews: due, inputWarnings }, null, 2),
    "utf-8",
  );
  writeFileSync(
    "reports/world_theme_candidate_review_latest.md",
    renderMarkdown(today, rows.length, due, inputWarnings),
    "utf-8",
  );

  console.log(`world theme candidate review: total=${rows.length}, due=${due.length}, warnings=${inputWarnings.length}`);
}

main();
