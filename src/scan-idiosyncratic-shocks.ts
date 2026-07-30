// 企業固有ショック / 不祥事ニュースの収集。
// 世界情勢・食糧不足・金利等のマクロ要因は除外し、未確認記事は review queue にのみ残す。
// pnpm scan:shocks

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { isMacroDriven } from "./idiosyncratic-shock.js";

type RuleConfig = {
  macroExclusions: string[];
  categories: Array<{
    id: string;
    label: string;
    keywords: string[];
    defaultActorType: string;
  }>;
};

type RssArticle = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
};

type ShockScanItem = RssArticle & {
  categoryHint: string;
  categoryLabel: string;
  actorTypeHint: string;
  matchedKeywords: string[];
  macroExcluded: boolean;
  reviewStatus: "needs_review";
  evidenceStatus: "reported";
  autoNotificationEligible: false;
};

const DEFAULT_QUERIES = [
  "上場企業 社長 不祥事 辞任",
  "上場企業 役員 不適切 報酬",
  "上場企業 役員 逮捕 贈賄",
  "上場企業 不適切発言 役員",
  "上場企業 第三者委員会 不祥事",
  "株 バイトテロ 従業員 不適切動画",
  "上場企業 SNS 迷惑動画 店舗",
  "CEO relationship employee resign company",
  "CEO misconduct resignation company stock",
  "executive conflict of interest fired company",
  "employee misconduct viral video public company",
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
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function parseRss(xml: string, fallbackSource: string): RssArticle[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
    .map(match => match[0])
    .map(item => ({
      title: pickTag(item, "title"),
      url: pickTag(item, "link"),
      source: pickTag(item, "source") || fallbackSource,
      publishedAt: pickTag(item, "pubDate"),
      snippet: pickTag(item, "description"),
    }))
    .filter(article => article.title.length > 0 && article.url.length > 0);
}

async function fetchQuery(query: string): Promise<RssArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
  const response = await fetch(url, {
    headers: { "user-agent": "alpha-pon/0.1 idiosyncratic-shock-scanner" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseRss(await response.text(), "Google News RSS");
}

function classify(article: RssArticle, rules: RuleConfig): ShockScanItem | null {
  const text = `${article.title} ${article.snippet}`.toLowerCase();
  if (isMacroDriven(text, rules.macroExclusions)) return null;

  let best: { id: string; label: string; actorType: string; matched: string[] } | null = null;
  for (const category of rules.categories) {
    const matched = category.keywords.filter(keyword => text.includes(keyword.toLowerCase()));
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matched.length) {
      best = { id: category.id, label: category.label, actorType: category.defaultActorType, matched };
    }
  }
  if (!best) return null;

  return {
    ...article,
    categoryHint: best.id,
    categoryLabel: best.label,
    actorTypeHint: best.actorType,
    matchedKeywords: best.matched,
    macroExcluded: false,
    reviewStatus: "needs_review",
    evidenceStatus: "reported",
    autoNotificationEligible: false,
  };
}

function dedupe(items: ShockScanItem[]): ShockScanItem[] {
  const byKey = new Map<string, ShockScanItem>();
  for (const item of items) {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

function renderMarkdown(date: string, items: ShockScanItem[], errors: string[]): string {
  const lines = [
    "# 企業固有ショック scan queue",
    "",
    `生成日: ${date}`,
    "",
    "> ここに載るだけでは12点候補ではありません。一次情報確認・10項目採点・株価沈静化を通過するまで通知禁止。",
    "> マクロ要因（戦争・関税・食糧不足・金利・自然災害など）はこのレイヤーから除外します。",
    "",
    `- review queue: ${items.length}件`,
    `- fetch errors: ${errors.length}件`,
    "",
  ];

  const grouped = new Map<string, ShockScanItem[]>();
  for (const item of items) {
    const rows = grouped.get(item.categoryHint) ?? [];
    rows.push(item);
    grouped.set(item.categoryHint, rows);
  }
  for (const [category, rows] of grouped) {
    lines.push(`## ${category} (${rows.length})`, "");
    for (const row of rows.slice(0, 15)) {
      lines.push(`- ${row.title}`);
      lines.push(`  - source: ${row.source}`);
      lines.push(`  - matched: ${row.matchedKeywords.join(", ")}`);
      lines.push(`  - url: ${row.url}`);
    }
    lines.push("");
  }
  if (errors.length > 0) {
    lines.push("## errors", "", ...errors.map(error => `- ${error}`), "");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const date = todayJst();
  const rules = load(readFileSync("config/idiosyncratic-shock-rules.yml", "utf-8")) as RuleConfig;
  const configured = (process.env.IDIOSYNCRATIC_SHOCK_QUERIES ?? "")
    .split("|")
    .map(value => value.trim())
    .filter(Boolean);
  const queries = configured.length > 0 ? configured : DEFAULT_QUERIES;
  const items: ShockScanItem[] = [];
  const errors: string[] = [];

  for (const query of queries) {
    try {
      const articles = await fetchQuery(query);
      for (const article of articles) {
        const classified = classify(article, rules);
        if (classified) items.push(classified);
      }
    } catch (error) {
      errors.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = dedupe(items).slice(0, 200);
  mkdirSync("reports", { recursive: true });
  const payload = { generatedAt: date, count: result.length, items: result, errors };
  writeFileSync("reports/idiosyncratic_shock_scan_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(`reports/idiosyncratic_shock_scan_${date}.json`, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_scan_latest.md", renderMarkdown(date, result, errors), "utf-8");
  console.log(`企業固有ショック scan: ${result.length}件 / errors=${errors.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
