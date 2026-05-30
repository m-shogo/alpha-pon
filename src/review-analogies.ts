import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { loadAnalogyOutcomeRecords, readJsonl, saveAnalogyOutcomes, type AnalogyOutcomeRecord, type AnalogyPredictionRecord } from "./analysis/analogy-db.js";

type ReviewMode = "dry-run" | "write";

const mode: ReviewMode = process.argv.includes("--write") ? "write" : "dry-run";

function compareDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function loadAllPredictions(): AnalogyPredictionRecord[] {
  const dir = join("data", "analogy_predictions");
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(file => file.endsWith(".jsonl"))
    .sort()
    .flatMap(file => readJsonl<AnalogyPredictionRecord>(join(dir, file)));
}

function isAlreadyReviewed(prediction: AnalogyPredictionRecord, outcomes: AnalogyOutcomeRecord[]): boolean {
  return outcomes.some(outcome => outcome.eventId === prediction.eventId && outcome.timeframe === prediction.timeframe);
}

function inferOutcome(prediction: AnalogyPredictionRecord): AnalogyOutcomeRecord {
  const needsHumanCheck = [
    "株価/指数の実測値",
    "追加ニュース",
    "会社開示",
    "市場全体の地合い",
  ];

  return {
    schemaVersion: 1,
    createdAt: prediction.createdAt,
    evaluatedAt: todayJst(),
    eventId: prediction.eventId,
    timeframe: prediction.timeframe,
    candidateCode: prediction.candidateCode,
    candidateName: prediction.candidateName,
    lessonId: prediction.lessonId,
    lessonTitle: prediction.lessonTitle,
    direction: "unknown",
    quality: "too_early",
    actualOutcome: "自動レビュー時点では、価格データ/追加ニュース/会社開示を未接続のため確定判定しない。人間確認または価格データ接続後に same/opposite/mixed を上書きする。",
    whatMatched: [],
    whatDiffered: [],
    missedSignals: needsHumanCheck,
    improvedRuleIdeas: [
      "価格データを接続して、予想時点からの1日/1週/1か月リターンを自動比較する",
      "関連ニュースの追加取得で、条件成立/反証成立を判定する",
      "市場全体の地合いを分離して、個別要因と相場全体要因を分ける",
    ],
  };
}

function renderReviewReport(predictions: AnalogyPredictionRecord[], outcomes: AnalogyOutcomeRecord[], date: string): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 類推予想レビュー");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push(`モード: ${mode}`);
  lines.push("");
  lines.push("> 1日後 / 1週間後 / 1か月後に、過去事例への類推が実際どうだったかを答え合わせするためのレポートです。");
  lines.push("> 現時点では価格データ・追加ニュース未接続のため、期限到来分をレビュー候補として抽出し、too_early/unknownで保存できます。");
  lines.push("");
  lines.push("## サマリー");
  lines.push("");
  lines.push(`- 期限到来レビュー候補: ${predictions.length}件`);
  lines.push(`- 今回生成outcome候補: ${outcomes.length}件`);
  lines.push("");

  if (predictions.length === 0) {
    lines.push("期限到来のレビュー候補はありません。");
    lines.push("");
  }

  for (const prediction of predictions.slice(0, 80)) {
    lines.push(`## ${prediction.candidateCode ?? "WORLD"} ${prediction.candidateName ?? "world event"} / ${prediction.timeframe}`);
    lines.push("");
    lines.push(`- Event ID: ${prediction.eventId}`);
    lines.push(`- 作成日: ${prediction.createdAt}`);
    lines.push(`- 期限: ${prediction.reviewDueAt}`);
    lines.push(`- 類似事例: ${prediction.lessonTitle}`);
    lines.push(`- 予想方向: ${prediction.expectedDirection}`);
    lines.push(`- 信頼度: ${(prediction.confidence * 100).toFixed(0)}%`);
    lines.push(`- 仮説: ${prediction.thesis}`);
    lines.push("");
    lines.push("### 成立条件");
    prediction.conditions.slice(0, 6).forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 反証条件");
    prediction.invalidationSignals.slice(0, 6).forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 答え合わせで見るもの");
    prediction.evidenceNeeded.slice(0, 6).forEach(item => lines.push(`- [ ] ${item}`));
    lines.push("- [ ] 予想日からの株価/指数リターン");
    lines.push("- [ ] 追加ニュース/会社開示");
    lines.push("- [ ] 市場全体要因との切り分け");
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon analogy review | ${date}*`);
  return lines.join("\n");
}

function main() {
  const date = todayJst();
  const predictions = loadAllPredictions();
  const outcomes = loadAnalogyOutcomeRecords();
  const due = predictions
    .filter(prediction => compareDate(prediction.reviewDueAt, date) <= 0)
    .filter(prediction => !isAlreadyReviewed(prediction, outcomes));
  const generated = due.map(inferOutcome);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `analogy_review_${date}.md`), renderReviewReport(due, generated, date), "utf-8");
  writeFileSync(join("reports", "analogy_review_latest.md"), renderReviewReport(due, generated, date), "utf-8");
  writeFileSync(join("reports", `analogy_review_${date}.json`), JSON.stringify({ due, generated }, null, 2), "utf-8");
  writeFileSync(join("reports", "analogy_review_latest.json"), JSON.stringify({ due, generated }, null, 2), "utf-8");

  if (mode === "write") {
    saveAnalogyOutcomes(generated);
  }

  console.log(`レビュー候補: ${due.length}件`);
  console.log(`レポート: reports/analogy_review_${date}.md`);
  console.log(mode === "write" ? "outcome保存: data/analogy_outcomes.jsonl" : "dry-run: 保存なし（保存するなら --write）");
}

main();
