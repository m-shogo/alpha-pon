import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { loadAnalogyOutcomeRecords, readJsonl, saveAnalogyOutcomes, type AnalogyOutcomeRecord, type AnalogyPredictionRecord } from "./analysis/analogy-db.js";
import { reviewPredictionWithPrice, type PriceReviewResult } from "./analysis/analogy-price-review.js";

type ReviewMode = "dry-run" | "write";

type GeneratedReview = {
  prediction: AnalogyPredictionRecord;
  priceReview: PriceReviewResult;
  outcome: AnalogyOutcomeRecord;
};

const mode: ReviewMode = process.argv.includes("--write") ? "write" : "dry-run";

function compareDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function predictionKey(prediction: AnalogyPredictionRecord): string {
  return `${prediction.eventId}__${prediction.timeframe}`;
}

function dedupePredictions(predictions: AnalogyPredictionRecord[]): AnalogyPredictionRecord[] {
  const seen = new Set<string>();
  const result: AnalogyPredictionRecord[] = [];

  for (const prediction of predictions) {
    const key = predictionKey(prediction);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(prediction);
  }

  return result;
}

function shouldPersistOutcome(review: GeneratedReview): boolean {
  return review.priceReview.available && review.outcome.quality !== "too_early" && review.outcome.direction !== "unknown";
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
  return outcomes.some(outcome =>
    outcome.eventId === prediction.eventId &&
    outcome.timeframe === prediction.timeframe &&
    outcome.quality !== "too_early"
  );
}

function outcomeFromPriceReview(prediction: AnalogyPredictionRecord, priceReview: PriceReviewResult): AnalogyOutcomeRecord {
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
    direction: priceReview.direction,
    quality: priceReview.quality,
    actualOutcome: priceReview.actualOutcome,
    whatMatched: priceReview.whatMatched,
    whatDiffered: priceReview.whatDiffered,
    missedSignals: priceReview.missedSignals,
    improvedRuleIdeas: priceReview.improvedRuleIdeas,
  };
}

function fmt(value: number | null | undefined): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function renderReviewReport(reviews: GeneratedReview[], date: string): string {
  const lines: string[] = [];
  const same = reviews.filter(r => r.outcome.direction === "same").length;
  const opposite = reviews.filter(r => r.outcome.direction === "opposite").length;
  const mixed = reviews.filter(r => r.outcome.direction === "mixed").length;
  const unknown = reviews.filter(r => r.outcome.direction === "unknown").length;
  const persistable = reviews.filter(shouldPersistOutcome).length;
  const retryLater = reviews.length - persistable;

  lines.push("# alpha-pon 類推予想レビュー");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push(`モード: ${mode}`);
  lines.push("");
  lines.push("> 1日後 / 1週間後 / 1か月後に、過去事例への類推が実際どうだったかを答え合わせするレポートです。");
  lines.push("> 銘柄コードがある予想は、J-Quantsの日足と市場ベンチマーク比で same / opposite / mixed を自動判定します。");
  lines.push("> 価格データ不足・銘柄コードなしなどの too_early は outcome DB に確定保存せず、次回以降も再レビュー対象に残します。");
  lines.push("");
  lines.push("## サマリー");
  lines.push("");
  lines.push(`- 期限到来レビュー候補: ${reviews.length}件`);
  lines.push(`- outcome保存対象: ${persistable}件`);
  lines.push(`- 次回以降に再確認: ${retryLater}件`);
  lines.push(`- same: ${same}件`);
  lines.push(`- opposite: ${opposite}件`);
  lines.push(`- mixed: ${mixed}件`);
  lines.push(`- unknown/too early: ${unknown}件`);
  lines.push("");

  if (reviews.length === 0) {
    lines.push("期限到来のレビュー候補はありません。");
    lines.push("");
  }

  for (const review of reviews.slice(0, 120)) {
    const prediction = review.prediction;
    const price = review.priceReview;
    const outcome = review.outcome;
    lines.push(`## ${prediction.candidateCode ?? "WORLD"} ${prediction.candidateName ?? "world event"} / ${prediction.timeframe}`);
    lines.push("");
    lines.push(`- Event ID: ${prediction.eventId}`);
    lines.push(`- 作成日: ${prediction.createdAt}`);
    lines.push(`- 期限: ${prediction.reviewDueAt}`);
    lines.push(`- 類似事例: ${prediction.lessonTitle}`);
    lines.push(`- 予想方向: ${prediction.expectedDirection}`);
    lines.push(`- 判定: **${outcome.direction} / ${outcome.quality}**`);
    lines.push(`- 確定保存: ${shouldPersistOutcome(review) ? "yes" : "no（次回以降に再確認）"}`);
    lines.push(`- 信頼度: ${(prediction.confidence * 100).toFixed(0)}%`);
    if (price.available) {
      lines.push(`- 価格: ${price.startDate ?? "?"} ${price.startClose ?? "?"} → ${price.endDate ?? "?"} ${price.endClose ?? "?"}`);
      lines.push(`- リターン: ${fmt(price.returnPct)} / ベンチマーク: ${fmt(price.benchmarkReturnPct)} / 相対: ${fmt(price.relativeReturnPct)}`);
    }
    lines.push(`- 仮説: ${prediction.thesis}`);
    lines.push(`- 実際: ${outcome.actualOutcome}`);
    lines.push("");

    if (outcome.whatMatched.length > 0) {
      lines.push("### 当たった/近かった点");
      outcome.whatMatched.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    if (outcome.whatDiffered.length > 0) {
      lines.push("### 違った/逆だった点");
      outcome.whatDiffered.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    lines.push("### 成立条件");
    prediction.conditions.slice(0, 6).forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 反証条件");
    prediction.invalidationSignals.slice(0, 6).forEach(item => lines.push(`- ${item}`));
    lines.push("");

    if (outcome.missedSignals.length > 0) {
      lines.push("### 見落とし/追加確認");
      outcome.missedSignals.slice(0, 6).forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`*alpha-pon analogy review | ${date}*`);
  return lines.join("\n");
}

async function main() {
  const date = todayJst();
  const predictions = dedupePredictions(loadAllPredictions());
  const outcomes = loadAnalogyOutcomeRecords();
  const due = predictions
    .filter(prediction => compareDate(prediction.reviewDueAt, date) <= 0)
    .filter(prediction => !isAlreadyReviewed(prediction, outcomes));

  const reviews: GeneratedReview[] = [];
  for (const prediction of due) {
    const priceReview = await reviewPredictionWithPrice(prediction);
    reviews.push({
      prediction,
      priceReview,
      outcome: outcomeFromPriceReview(prediction, priceReview),
    });
  }
  const generated = reviews.map(review => review.outcome);
  const writable = reviews.filter(shouldPersistOutcome).map(review => review.outcome);
  const retryLater = generated.filter(outcome => !writable.some(saved => saved.eventId === outcome.eventId && saved.timeframe === outcome.timeframe));

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `analogy_review_${date}.md`), renderReviewReport(reviews, date), "utf-8");
  writeFileSync(join("reports", "analogy_review_latest.md"), renderReviewReport(reviews, date), "utf-8");
  writeFileSync(join("reports", `analogy_review_${date}.json`), JSON.stringify({ due, generated, saved: writable, retryLater, reviews }, null, 2), "utf-8");
  writeFileSync(join("reports", "analogy_review_latest.json"), JSON.stringify({ due, generated, saved: writable, retryLater, reviews }, null, 2), "utf-8");

  if (mode === "write") {
    saveAnalogyOutcomes(writable);
  }

  console.log(`レビュー候補: ${due.length}件`);
  console.log(`outcome保存対象: ${writable.length}件 / 次回再確認: ${retryLater.length}件`);
  console.log(`レポート: reports/analogy_review_${date}.md`);
  console.log(mode === "write" ? "outcome保存: data/analogy_outcomes.jsonl" : "dry-run: 保存なし（保存するなら --write）");
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
