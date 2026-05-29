import type { LessonMatch } from "./market-lessons.js";
import { findRelatedMarketLessonsForScore } from "./market-lesson-links.js";
import type { ScoreResult } from "../types.js";

export type ModernAnalogy = {
  lessonTitle: string;
  analogyRisk: "low" | "medium" | "high";
  similarPoints: string[];
  differentPoints: string[];
  evidenceNeeded: string[];
  falseAnalogyTraps: string[];
  practicalQuestions: string[];
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function inferSimilarPoints(result: ScoreResult, match: LessonMatch): string[] {
  const lesson = match.lesson;
  const points: string[] = [];

  if (match.matchedTags.length > 0) {
    points.push(`テーマ/タグが重なる: ${match.matchedTags.slice(0, 5).join(", ")}`);
  }

  if (result.hypeRisk?.level === "high" && lesson.affectedTags.some(tag => ["hype", "bubble", "meme", "social_media", "ipo"].includes(tag))) {
    points.push("人気化・過熱・FOMO の構造が似ている可能性");
  }

  if (result.marketContext?.volatility20d != null && result.marketContext.volatility20d > 5) {
    points.push("値動きが荒く、需給やニュースの影響を受けやすい可能性");
  }

  if (result.candidate.rules.includes("structural_event") && lesson.affectedTags.some(tag => ["policy", "regulation", "scandal", "governance"].includes(tag))) {
    points.push("構造イベント・規制・ガバナンス変化の影響を見る必要がある");
  }

  if (result.financialQuality?.hasDownwardRevision === true) {
    points.push("業績・会社予想の信頼性を再確認する必要がある");
  }

  return unique(points).slice(0, 4);
}

function inferDifferentPoints(result: ScoreResult, match: LessonMatch): string[] {
  const lesson = match.lesson;
  const points: string[] = [];

  points.push("時代背景・金利・政策・規制・市場参加者が当時とは違う");

  if (result.financialQuality?.qualityScore != null && result.financialQuality.qualityScore >= 7) {
    points.push("財務品質が一定以上あり、過去の破綻/粉飾型とは異なる可能性");
  }

  if (result.dataQuality === "ok") {
    points.push("現時点では取得データがあり、完全な不透明案件とは限らない");
  }

  if (result.hypeRisk?.level === "low" && lesson.affectedTags.some(tag => ["bubble", "hype", "meme", "social_media"].includes(tag))) {
    points.push("過熱リスクは低めで、過去の熱狂相場とは違う可能性");
  }

  if (result.marketContext?.relativeToTopix20d != null && result.marketContext.relativeToTopix20d >= 0) {
    points.push("市場対比では弱くなく、単純なリスクオフとは違う可能性");
  }

  return unique(points).slice(0, 4);
}

function inferAnalogyRisk(result: ScoreResult, match: LessonMatch): ModernAnalogy["analogyRisk"] {
  let risk = 0;

  if (match.score < 20) risk += 2;
  if (match.matchedTags.length <= 1) risk += 1;
  if (result.dataQuality !== "ok") risk += 1;
  if (!result.financialQuality) risk += 1;
  if (!result.marketContext) risk += 1;

  if (risk >= 3) return "high";
  if (risk >= 1) return "medium";
  return "low";
}

function buildFalseAnalogyTraps(): string[] {
  return [
    "似ているタグがあるだけで、同じ結果になると決めつけない",
    "映画・SNS・有名事例の印象に引っ張られすぎない",
    "一つの過去事例だけで判断せず、最低でも反対事例を一つ探す",
    "過去の暴落/急騰の結果ではなく、当時のメカニズムと現在の証拠を比べる",
  ];
}

export function buildModernAnalogies(result: ScoreResult, limit = 3): ModernAnalogy[] {
  const matches = findRelatedMarketLessonsForScore(result, limit);

  return matches.map(match => ({
    lessonTitle: match.lesson.title,
    analogyRisk: inferAnalogyRisk(result, match),
    similarPoints: inferSimilarPoints(result, match),
    differentPoints: inferDifferentPoints(result, match),
    evidenceNeeded: unique([
      ...match.lesson.primaryChecks.slice(0, 5),
      ...(result.hypothesisMap?.sourceNeeds.slice(0, 4) ?? []),
      "会社開示",
      "決算説明資料",
      "価格に織り込み済みかの確認",
    ]).slice(0, 8),
    falseAnalogyTraps: buildFalseAnalogyTraps(),
    practicalQuestions: unique([
      ...match.lesson.modernAnalogyQuestions.slice(0, 3),
      ...(result.hypothesisMap?.watchQuestions.slice(0, 3) ?? []),
    ]).slice(0, 6),
  }));
}

export function renderModernAnalogiesMarkdown(result: ScoreResult): string[] {
  const analogies = buildModernAnalogies(result, 3);
  if (analogies.length === 0) return [];

  const lines: string[] = [];
  lines.push("## 過去事例を現代に当てはめるロジック");
  lines.push("");
  lines.push("> ここはスコア加点ではありません。過去事例を“答え”にせず、似ている点・違う点・確認する証拠を増やすための補助です。");
  lines.push("");

  for (const analogy of analogies) {
    lines.push(`### ${analogy.lessonTitle}`);
    lines.push("");
    lines.push(`- 類推リスク: **${analogy.analogyRisk}**`);
    lines.push("");

    if (analogy.similarPoints.length > 0) {
      lines.push("#### 似ている点");
      analogy.similarPoints.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    if (analogy.differentPoints.length > 0) {
      lines.push("#### 違う点");
      analogy.differentPoints.forEach(item => lines.push(`- ${item}`));
      lines.push("");
    }

    lines.push("#### 先に確認する証拠");
    analogy.evidenceNeeded.slice(0, 6).forEach(item => lines.push(`- [ ] ${item}`));
    lines.push("");

    lines.push("#### 現代に当てはめる質問");
    analogy.practicalQuestions.slice(0, 4).forEach(item => lines.push(`- ${item}`));
    lines.push("");
  }

  lines.push("### 類推の罠");
  buildFalseAnalogyTraps().forEach(item => lines.push(`- ⚠️ ${item}`));
  lines.push("");

  return lines;
}
