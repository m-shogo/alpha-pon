// 類推予想の答え合わせ
// data/analogy_predictions/*.jsonl と reports/scores_*.json を突き合わせ、暫定的に当たり外れを確認する
// pnpm review:predictions

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import type { AnalogyExpectedDirection, AnalogyOutcomeDirection, AnalogyOutcomeQuality, AnalogyPredictionRecord } from "./analysis/analogy-db.js";

type ScoreLogEntry = {
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  dataQuality?: string;
  createdAt: string;
  reasons?: string[];
  negativeReasons?: string[];
  warnings?: string[];
};

type ScorePoint = {
  date: string;
  code: string;
  name: string;
  score: number;
  alertLevel: string;
  dataQuality?: string;
};

type PredictionReviewRecord = {
  schemaVersion: 1;
  reviewedAt: string;
  eventId: string;
  candidateCode?: string;
  candidateName?: string;
  lessonId: string;
  lessonTitle: string;
  expectedDirection: AnalogyExpectedDirection;
  expectedTimeframe: string;
  confidence: number;
  baseDate: string;
  baseScore: number | null;
  reviewDate: string | null;
  reviewScore: number | null;
  scoreDelta: number | null;
  direction: AnalogyOutcomeDirection;
  quality: AnalogyOutcomeQuality;
  whatMatched: string[];
  whatDiffered: string[];
  missedSignals: string[];
  improvedRuleIdeas: string[];
  note: string;
};

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function loadPredictions(): AnalogyPredictionRecord[] {
  const dir = join("data", "analogy_predictions");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter(file => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
    .sort();
  return files.flatMap(file => readJsonl<AnalogyPredictionRecord>(join(dir, file)));
}

function loadScorePoints(): ScorePoint[] {
  const reportsDir = "reports";
  if (!existsSync(reportsDir)) return [];
  const files = readdirSync(reportsDir)
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  const points: ScorePoint[] = [];

  for (const file of files) {
    const date = file.replace("scores_", "").replace(".json", "");
    try {
      const entries = JSON.parse(readFileSync(join(reportsDir, file), "utf-8")) as ScoreLogEntry[];
      for (const entry of entries) {
        points.push({
          date,
          code: entry.code,
          name: entry.name,
          score: entry.score,
          alertLevel: entry.alertLevel,
          dataQuality: entry.dataQuality,
        });
      }
    } catch {
      // 壊れたログは無視
    }
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function timeframeDays(timeframe: string): number {
  switch (timeframe) {
    case "1d": return 1;
    case "1w": return 7;
    case "1m": return 30;
    case "3m": return 90;
    default: return 7;
  }
}

function findClosestPoint(points: ScorePoint[], code: string | undefined, targetDate: string): ScorePoint | null {
  if (!code) return null;
  const sameCode = points.filter(point => point.code === code && point.date >= targetDate);
  return sameCode[0] ?? null;
}

function findBasePoint(points: ScorePoint[], code: string | undefined, baseDate: string): ScorePoint | null {
  if (!code) return null;
  const sameCode = points.filter(point => point.code === code && point.date <= baseDate);
  return sameCode[sameCode.length - 1] ?? points.find(point => point.code === code) ?? null;
}

function classifyDirection(expected: AnalogyExpectedDirection, scoreDelta: number | null): AnalogyOutcomeDirection {
  if (scoreDelta == null) return "unknown";
  const up = scoreDelta >= 3;
  const down = scoreDelta <= -3;
  const flat = !up && !down;

  if (expected === "up") return up ? "same" : down ? "opposite" : "mixed";
  if (expected === "down" || expected === "risk_off") return down ? "same" : up ? "opposite" : "mixed";
  if (expected === "mixed") return flat ? "mixed" : "same";
  return "unknown";
}

function classifyQuality(direction: AnalogyOutcomeDirection, scoreDelta: number | null): AnalogyOutcomeQuality {
  if (scoreDelta == null) return "too_early";
  if (direction === "same") return "useful";
  if (direction === "opposite") return "misleading";
  if (direction === "mixed") return "unknown";
  return "unknown";
}

function buildReview(prediction: AnalogyPredictionRecord, points: ScorePoint[], reviewedAt: string): PredictionReviewRecord {
  const baseDate = prediction.createdAt.slice(0, 10);
  const targetDate = addDays(baseDate, timeframeDays(prediction.expectedTimeframe ?? "1w"));
  const base = findBasePoint(points, prediction.candidateCode, baseDate);
  const review = findClosestPoint(points, prediction.candidateCode, targetDate);
  const scoreDelta = base && review ? review.score - base.score : null;
  const direction = classifyDirection(prediction.expectedDirection, scoreDelta);
  const quality = classifyQuality(direction, scoreDelta);

  const whatMatched: string[] = [];
  const whatDiffered: string[] = [];
  const missedSignals: string[] = [];
  const improvedRuleIdeas: string[] = [];

  if (direction === "same") {
    whatMatched.push("予想方向とスコア変化の方向が概ね一致した");
    whatMatched.push(...prediction.similarPoints.slice(0, 3));
  } else if (direction === "opposite") {
    whatDiffered.push("予想方向とスコア変化が逆方向になった");
    whatDiffered.push(...prediction.differentPoints.slice(0, 3));
    missedSignals.push(...prediction.invalidationSignals.slice(0, 4));
    improvedRuleIdeas.push("逆方向になった事例は、過去事例の重みではなく反証条件の強化に使う");
  } else if (direction === "mixed") {
    whatMatched.push("大きな一方向変化ではなく、混在または小幅変化だった");
    missedSignals.push("ニュースが銘柄スコアへ届くまでの時間差、または市場織り込み済みの可能性を確認する");
    improvedRuleIdeas.push("時間軸を1w固定ではなく、テーマ別に1d/1w/1mへ分ける");
  } else {
    missedSignals.push("比較できるスコアログが不足。dailyを継続してログを貯める");
    improvedRuleIdeas.push("答え合わせには継続ログと市場価格データが必要");
  }

  return {
    schemaVersion: 1,
    reviewedAt,
    eventId: prediction.eventId,
    candidateCode: prediction.candidateCode,
    candidateName: prediction.candidateName,
    lessonId: prediction.lessonId,
    lessonTitle: prediction.lessonTitle,
    expectedDirection: prediction.expectedDirection,
    expectedTimeframe: prediction.expectedTimeframe ?? "",
    confidence: prediction.confidence,
    baseDate,
    baseScore: base?.score ?? null,
    reviewDate: review?.date ?? null,
    reviewScore: review?.score ?? null,
    scoreDelta,
    direction,
    quality,
    whatMatched,
    whatDiffered,
    missedSignals,
    improvedRuleIdeas,
    note: "現段階では株価ではなくalpha-ponスコア変化による暫定レビュー。市場価格データ接続後に精度を上げる。",
  };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function top(map: Map<string, number>, limit = 12): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function renderReport(date: string, reviews: PredictionReviewRecord[]): string {
  const lines: string[] = [];
  const byQuality = new Map<string, number>();
  const byDirection = new Map<string, number>();
  const usefulLessons = new Map<string, number>();
  const misleadingLessons = new Map<string, number>();
  const missedSignals = new Map<string, number>();

  for (const review of reviews) {
    increment(byQuality, review.quality);
    increment(byDirection, review.direction);
    if (review.quality === "useful") increment(usefulLessons, review.lessonTitle);
    if (review.quality === "misleading") increment(misleadingLessons, review.lessonTitle);
    for (const signal of review.missedSignals) increment(missedSignals, signal);
  }

  lines.push("# alpha-pon 類推予想レビュー");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 過去事例から作った仮説を、後日のスコアログで暫定的に答え合わせするレポートです。買い推奨ではありません。");
  lines.push("> 現段階では株価ではなく alpha-pon スコア変化を使います。市場価格データを接続したら精度を上げます。");
  lines.push("");

  lines.push("## サマリー");
  lines.push("");
  lines.push(`- レビュー件数: ${reviews.length}`);
  for (const [key, count] of top(byQuality, 10)) lines.push(`- quality=${key}: ${count}件`);
  for (const [key, count] of top(byDirection, 10)) lines.push(`- direction=${key}: ${count}件`);
  lines.push("");

  lines.push("## 使えた過去事例");
  lines.push("");
  top(usefulLessons).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  if (usefulLessons.size === 0) lines.push("- まだ十分な答え合わせデータがありません。");
  lines.push("");

  lines.push("## ミスリードした可能性がある事例");
  lines.push("");
  top(misleadingLessons).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  if (misleadingLessons.size === 0) lines.push("- まだ十分な反例データがありません。");
  lines.push("");

  lines.push("## よく出た見落とし・反証条件");
  lines.push("");
  top(missedSignals).forEach(([key, count]) => lines.push(`- ${count}件: ${key}`));
  if (missedSignals.size === 0) lines.push("- まだ十分な見落としデータがありません。");
  lines.push("");

  lines.push("## 個別レビュー");
  lines.push("");
  for (const review of reviews.slice(0, 80)) {
    lines.push(`### ${review.candidateCode ?? "-"} ${review.candidateName ?? "-"} / ${review.lessonTitle}`);
    lines.push(`- 予想: ${review.expectedDirection} / ${review.expectedTimeframe} / confidence=${review.confidence.toFixed(2)}`);
    lines.push(`- 比較: ${review.baseDate} ${review.baseScore ?? "N/A"} → ${review.reviewDate ?? "N/A"} ${review.reviewScore ?? "N/A"} / delta=${review.scoreDelta ?? "N/A"}`);
    lines.push(`- 判定: direction=${review.direction}, quality=${review.quality}`);
    if (review.whatMatched.length) lines.push(`- 合っていた点: ${review.whatMatched[0]}`);
    if (review.whatDiffered.length) lines.push(`- 違った点: ${review.whatDiffered[0]}`);
    if (review.missedSignals.length) lines.push(`- 見落とし候補: ${review.missedSignals[0]}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon prediction review | ${date} | ※買い推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const date = todayJst();
  const predictions = loadPredictions();
  const points = loadScorePoints();
  mkdirSync("reports", { recursive: true });
  mkdirSync(join("data", "analogy_reviews"), { recursive: true });

  const reviews = predictions.map(prediction => buildReview(prediction, points, date));

  writeFileSync(join("data", "analogy_reviews", `${date}.json`), JSON.stringify(reviews, null, 2), "utf-8");
  writeFileSync(join("data", "analogy_reviews_latest.json"), JSON.stringify(reviews, null, 2), "utf-8");
  writeFileSync(join("reports", `prediction_review_${date}.md`), renderReport(date, reviews), "utf-8");
  writeFileSync(join("reports", "prediction_review_latest.md"), renderReport(date, reviews), "utf-8");

  console.log(`レビュー件数: ${reviews.length}`);
  console.log(`レポート: reports/prediction_review_${date}.md`);
  console.log(`DB: data/analogy_reviews/${date}.json`);
}

main();
