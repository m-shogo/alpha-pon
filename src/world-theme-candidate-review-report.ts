// world_theme_candidate_hypotheses.jsonl から、30/90/180日後の答え合わせ待ちを出す。
// 買い推奨ではなく、仮説が一次情報・価格反応・業績に接続したかを後で確認するためのレポート。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { isValidWorldThemeReviewDueDate } from "./world-theme-review-date.js";

type ReviewDue = { afterDays: 30 | 90 | 180; dueAt: string; status: "open" | "reviewed" };

type PersistedWorldThemeCandidateHypothesis = {
  schemaVersion: 1;
  hypothesisId: string;
  detectedAt: string;
  sourceEventTitle: string;
  theme: string;
  candidateCode: string;
  candidateCompany: string;
  whyThisCompany: string;
  upsideHypothesis: string;
  downsideRisk: string;
  nextPrimaryCheck: string;
  reviewDueDates: ReviewDue[];
  status: "open" | "closed";
};

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

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

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

function renderMarkdown(today: string, total: number, due: DueItem[]): string {
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
    "",
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
  const rows = readJsonl<PersistedWorldThemeCandidateHypothesis>("data/world_theme_candidate_hypotheses.jsonl");
  const due = dueItems(rows, today).sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/world_theme_candidate_review_latest.json", JSON.stringify({ generatedAt: today, totalHypotheses: rows.length, dueReviews: due }, null, 2), "utf-8");
  writeFileSync("reports/world_theme_candidate_review_latest.md", renderMarkdown(today, rows.length, due), "utf-8");

  console.log(`world theme candidate review: total=${rows.length}, due=${due.length}`);
}

main();