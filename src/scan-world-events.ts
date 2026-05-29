// 世界イベントスキャン
// ニュース/RSSから、AI・宇宙・WHO緊急事態・大統領選・エネルギー・人手不足などを分類する
// pnpm scan:world

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { classifyWorldEvent, summarizeWorldEvents, type ClassifiedWorldEvent, type WorldEventArticle } from "./analysis/world-event-map.js";

const DEFAULT_FEEDS = [
  "https://news.google.com/rss/search?q=WHO+public+health+emergency+OR+outbreak&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=space+satellite+Starlink+rocket+launch&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=AI+semiconductor+datacenter+power+grid&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=presidential+election+tariff+sanction+subsidy&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=oil+energy+LNG+nuclear+power+grid&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=Japan+labor+shortage+immigration+aging+robotics&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=supply+chain+export+control+tariff+rare+earth&hl=en-US&gl=US&ceid=US:en",
];

function decodeXml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .trim();
}

function pickTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function parseRss(xml: string, fallbackSource: string): WorldEventArticle[] {
  const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map(match => match[0]);
  return items.map(item => ({
    title: pickTag(item, "title"),
    url: pickTag(item, "link"),
    source: pickTag(item, "source") || fallbackSource,
    publishedAt: pickTag(item, "pubDate"),
    snippet: pickTag(item, "description"),
  })).filter(article => article.title.length > 0);
}

async function fetchFeed(url: string): Promise<WorldEventArticle[]> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "alpha-pon/0.1 world-event-scanner",
    },
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRss(xml, url);
}

function dedupeArticles(articles: WorldEventArticle[]): WorldEventArticle[] {
  const seen = new Set<string>();
  const result: WorldEventArticle[] = [];

  for (const article of articles) {
    const key = `${article.title}__${article.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
  }

  return result;
}

function renderMarkdown(date: string, events: ClassifiedWorldEvent[], errors: string[]): string {
  const lines: string[] = [];
  const important = events.filter(event => event.totalImpactScore > 0).sort((a, b) => b.totalImpactScore - a.totalImpactScore);

  lines.push("# alpha-pon 世界イベントレポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 世界イベントを、銘柄テーマや仮説マップに接続するための材料整理です。買い推奨ではありません。");
  lines.push("");

  lines.push("## サマリー");
  lines.push("");
  lines.push(`- 取得記事: ${events.length}件`);
  lines.push(`- 投資テーマ接続あり: ${important.length}件`);
  if (errors.length > 0) lines.push(`- 取得エラー: ${errors.length}件`);
  lines.push("");

  const summary = summarizeWorldEvents(important);
  if (summary.length > 0) {
    lines.push("## 重要そうな連鎖");
    lines.push("");
    lines.push(...summary);
    lines.push("");
  }

  lines.push("## 記事別分類");
  lines.push("");
  for (const event of important.slice(0, 30)) {
    lines.push(`### ${event.title}`);
    lines.push("");
    if (event.source) lines.push(`- Source: ${event.source}`);
    if (event.publishedAt) lines.push(`- Published: ${event.publishedAt}`);
    if (event.url) lines.push(`- URL: ${event.url}`);
    lines.push(`- Impact score: ${event.totalImpactScore}`);
    lines.push("");

    for (const impact of event.impacts) {
      lines.push(`#### ${impact.category}`);
      lines.push(`- Matched: ${impact.matchedKeywords.join(", ")}`);
      lines.push(`- Impacted tags: ${impact.impactedTags.join(", ")}`);
      lines.push(`- Hypothesis clusters: ${impact.hypothesisClusters.join(", ")}`);
      lines.push(`- Possible beneficiaries: ${impact.possibleBeneficiaries.join(", ")}`);
      lines.push(`- Possible risks: ${impact.possibleRisks.join(", ")}`);
      lines.push(`- First question: ${impact.watchQuestions[0]}`);
      lines.push(`- Primary checks: ${impact.primaryChecks.slice(0, 5).join(", ")}`);
      lines.push("");
    }
  }

  if (errors.length > 0) {
    lines.push("## 取得エラー");
    lines.push("");
    errors.forEach(error => lines.push(`- ${error}`));
    lines.push("");
  }

  lines.push("---");
  lines.push(`*alpha-pon world events | ${date} | ※買い推奨ではありません*`);

  return lines.join("\n");
}

async function main() {
  const date = todayJst();
  const feedUrls = (process.env.WORLD_EVENT_FEEDS ?? "")
    .split(",")
    .map(feed => feed.trim())
    .filter(Boolean);
  const feeds = feedUrls.length > 0 ? feedUrls : DEFAULT_FEEDS;

  console.log(`alpha-pon 世界イベントスキャン: ${date}`);
  console.log(`feeds: ${feeds.length}`);

  const articles: WorldEventArticle[] = [];
  const errors: string[] = [];

  for (const feed of feeds) {
    try {
      const fetched = await fetchFeed(feed);
      articles.push(...fetched);
      console.log(`ok: ${feed} (${fetched.length})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${feed}: ${message}`);
      console.log(`ng: ${feed} (${message})`);
    }
  }

  const deduped = dedupeArticles(articles);
  const classified = deduped.map(classifyWorldEvent).sort((a, b) => b.totalImpactScore - a.totalImpactScore);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `world_events_${date}.json`), JSON.stringify(classified, null, 2), "utf-8");
  writeFileSync(join("reports", "world_events_latest.json"), JSON.stringify(classified, null, 2), "utf-8");
  writeFileSync(join("reports", `world_events_${date}.md`), renderMarkdown(date, classified, errors), "utf-8");
  writeFileSync(join("reports", "world_events_latest.md"), renderMarkdown(date, classified, errors), "utf-8");

  console.log(`report: reports/world_events_${date}.md`);
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
