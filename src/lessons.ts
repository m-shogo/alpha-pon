// 市場レッスン検索
// pnpm lessons
// pnpm lessons ai
// pnpm lessons bank credit

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { MARKET_LESSONS, renderMarketLessonMarkdown, type LessonMatch, type MarketLesson } from "./analysis/market-lessons.js";
import { EXTRA_MARKET_LESSONS } from "./analysis/market-lessons-extra.js";
import { CRISIS_MARKET_LESSONS } from "./analysis/market-lessons-crisis.js";

const ALL_MARKET_LESSONS: MarketLesson[] = [
  ...MARKET_LESSONS,
  ...EXTRA_MARKET_LESSONS,
  ...CRISIS_MARKET_LESSONS,
];

function matchAllMarketLessons(input: { tags: string[]; text?: string }): LessonMatch[] {
  const tags = new Set(input.tags.map(tag => tag.toLowerCase()));
  const text = (input.text ?? "").toLowerCase();

  return ALL_MARKET_LESSONS
    .map(lesson => {
      const matchedTags = lesson.affectedTags.filter(tag => tags.has(tag.toLowerCase()) || text.includes(tag.toLowerCase()));
      const textHits = [lesson.category, lesson.title, lesson.shortSummary]
        .filter(value => text.includes(value.toLowerCase())).length;
      const score = matchedTags.length * 12 + textHits * 10;
      const why = [
        ...matchedTags.map(tag => `tag:${tag}`),
        ...(textHits > 0 ? ["text similarity"] : []),
      ];
      return { lesson, matchedTags, score, why } satisfies LessonMatch;
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
}

function renderAllLessons(): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 市場レッスン集");
  lines.push("");
  lines.push(`生成日: ${todayJst()}`);
  lines.push("");
  lines.push(`収録件数: ${ALL_MARKET_LESSONS.length}件`);
  lines.push("");
  lines.push("> 過去の暴落・急騰・スキャンダル・需給イベントから、今のニュースを読むための型を蓄積するレポートです。買い推奨ではありません。");
  lines.push("> 重要: このレッスンはスコア加点には使わず、仮説・反証・確認項目としてだけ使います。");
  lines.push("");

  for (const lesson of ALL_MARKET_LESSONS) {
    lines.push(`## ${lesson.title}`);
    lines.push("");
    lines.push(`- Period: ${lesson.period}`);
    lines.push(`- Direction: ${lesson.direction}`);
    lines.push(`- Category: ${lesson.category}`);
    lines.push(`- Tags: ${lesson.affectedTags.join(", ")}`);
    lines.push("");
    lines.push(lesson.shortSummary);
    lines.push("");
    lines.push("### 連鎖");
    lesson.chain.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 早期シグナル");
    lesson.earlySignals.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 間違った学び");
    lesson.wrongTakeaways.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 使える学び");
    lesson.usefulTakeaways.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 現代に当てはめる質問");
    lesson.modernAnalogyQuestions.forEach(item => lines.push(`- ${item}`));
    lines.push("");
    lines.push("### 一次情報チェック");
    lesson.primaryChecks.forEach(item => lines.push(`- ${item}`));
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon market lessons | ${todayJst()} | ※買い推奨ではありません*`);
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const date = todayJst();
  mkdirSync("reports", { recursive: true });

  if (args.length === 0) {
    const md = renderAllLessons();
    writeFileSync(join("reports", `market_lessons_${date}.md`), md, "utf-8");
    writeFileSync(join("reports", "market_lessons_latest.md"), md, "utf-8");
    writeFileSync(join("reports", "market_lessons_latest.json"), JSON.stringify(ALL_MARKET_LESSONS, null, 2), "utf-8");
    console.log(`レポート: reports/market_lessons_${date}.md`);
    return;
  }

  const query = args.join(" ");
  const matches = matchAllMarketLessons({ tags: args, text: query });
  const lines = [
    "# alpha-pon 市場レッスン検索",
    "",
    `生成日: ${date}`,
    `Query: ${query}`,
    `検索対象: ${ALL_MARKET_LESSONS.length}件`,
    "",
    matches.length > 0 ? renderMarketLessonMarkdown(matches) : "該当する市場レッスンはありませんでした。タグやキーワードを増やしてください。",
  ];

  const output = lines.join("\n");
  writeFileSync(join("reports", `market_lessons_search_${date}.md`), output, "utf-8");
  writeFileSync(join("reports", "market_lessons_search_latest.md"), output, "utf-8");
  console.log(`検索結果: ${matches.length}件`);
  console.log(`レポート: reports/market_lessons_search_${date}.md`);
}

main();
