// 市場レッスン検索
// pnpm lessons
// pnpm lessons ai
// pnpm lessons bank credit

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { MARKET_LESSONS, matchMarketLessons, renderMarketLessonMarkdown } from "./analysis/market-lessons.js";

function renderAllLessons(): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 市場レッスン集");
  lines.push("");
  lines.push(`生成日: ${todayJst()}`);
  lines.push("");
  lines.push("> 過去の暴落・急騰・スキャンダル・需給イベントから、今のニュースを読むための型を蓄積するレポートです。買い推奨ではありません。");
  lines.push("");

  for (const lesson of MARKET_LESSONS) {
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
    writeFileSync(join("reports", "market_lessons_latest.json"), JSON.stringify(MARKET_LESSONS, null, 2), "utf-8");
    console.log(`レポート: reports/market_lessons_${date}.md`);
    return;
  }

  const query = args.join(" ");
  const matches = matchMarketLessons({ tags: args, text: query });
  const lines = [
    "# alpha-pon 市場レッスン検索",
    "",
    `生成日: ${date}`,
    `Query: ${query}`,
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
