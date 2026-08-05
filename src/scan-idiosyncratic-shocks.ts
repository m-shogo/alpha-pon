// 企業固有ショック / 不祥事ニュースの収集。
// 世界情勢・食糧不足・金利等のマクロ要因は除外し、未確認記事は review queue にのみ残す。
// 価格providerが無い市場もresearch discoveryまでは行い、通知だけfail-closedにする。
// pnpm scan:shocks

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { isMacroDriven } from "./idiosyncratic-shock.js";
import type { ShockMarket } from "./idiosyncratic-shock-market.js";

type RuleConfig = {
  macroExclusions: string[];
  categories: Array<{
    id: string;
    label: string;
    keywords: string[];
    defaultActorType: string;
  }>;
};

type ScanMarketHint = ShockMarket | "UNKNOWN";

type QuerySpec = {
  query: string;
  marketHint: ScanMarketHint;
  hl: string;
  gl: string;
  ceid: string;
};

type FeedLocale = { hl: string; gl: string; ceid: string };

type RssArticle = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  snippet: string;
};

type ShockScanItem = RssArticle & {
  marketHint: ScanMarketHint;
  categoryHint: string;
  categoryLabel: string;
  actorTypeHint: string;
  matchedKeywords: string[];
  macroExcluded: boolean;
  reviewStatus: "needs_review";
  evidenceStatus: "reported";
  autoNotificationEligible: false;
};

const JP_QUERIES = [
  "上場企業 社長 不祥事 辞任",
  "上場企業 役員 不適切 報酬",
  "上場企業 役員 逮捕 贈賄",
  "上場企業 従業員 逮捕 顧客",
  "上場企業 社員 横領 顧客",
  "上場企業 不適切発言 役員",
  "上場企業 第三者委員会 不祥事",
  "上場企業 特別調査委員会 架空取引 循環取引",
  "上場企業 会計不正 過年度訂正",
  "上場企業 品質 不適切検査 調査",
  "株 バイトテロ 従業員 不適切動画",
  "上場企業 SNS 迷惑動画 店舗",
];

const US_QUERIES = [
  "public company CEO misconduct resignation",
  "public company CEO relationship policy violation resignation",
  "public company executive conflict of interest fired",
  "public company executive improper compensation investigation",
  "public company employee misconduct viral video",
  "public company employee arrested customer misconduct",
  "public company accounting misconduct investigation restatement",
  "public company internal investigation executive resignation",
  "public company quality falsification investigation",
  "SEC investigation executive misconduct public company",
];

const REGIONAL_QUERIES: Partial<Record<ShockMarket, string[]>> = {
  UK: [
    "UK listed company CEO misconduct resignation",
    "FTSE company executive misconduct investigation",
    "UK listed company accounting misconduct restatement",
  ],
  EUROPE: [
    "European listed company CEO misconduct resignation",
    "European listed company executive misconduct investigation",
    "European listed company accounting fraud investigation",
  ],
  AU: [
    "ASX listed company CEO misconduct resignation",
    "ASX listed company executive misconduct investigation",
    "ASX listed company accounting misconduct investigation",
  ],
  CA: [
    "TSX listed company CEO misconduct resignation",
    "Canadian listed company executive misconduct investigation",
    "TSX accounting misconduct investigation company",
  ],
  HK: [
    "Hong Kong listed company CEO misconduct resignation",
    "HKEX listed company executive misconduct investigation",
    "Hong Kong listed company accounting misconduct investigation",
  ],
  KR: [
    "KOSPI company CEO misconduct resignation",
    "South Korea listed company executive misconduct investigation",
    "South Korea listed company accounting misconduct investigation",
  ],
  SG: [
    "SGX listed company CEO misconduct resignation",
    "Singapore listed company executive misconduct investigation",
    "SGX accounting misconduct investigation",
  ],
  CN: [
    "China listed company executive misconduct investigation",
    "China A-share company accounting misconduct investigation",
    "China listed company chairman misconduct resignation",
  ],
  TW: [
    "Taiwan listed company executive misconduct investigation",
    "Taiwan listed company accounting misconduct investigation",
    "Taiwan listed company CEO resignation misconduct",
  ],
};

const FEED_LOCALES: Partial<Record<ShockMarket, FeedLocale>> = {
  JP: { hl: "ja", gl: "JP", ceid: "JP:ja" },
  US: { hl: "en", gl: "US", ceid: "US:en" },
  UK: { hl: "en", gl: "GB", ceid: "GB:en" },
  EUROPE: { hl: "en", gl: "GB", ceid: "GB:en" },
  AU: { hl: "en", gl: "AU", ceid: "AU:en" },
  CA: { hl: "en", gl: "CA", ceid: "CA:en" },
  HK: { hl: "en", gl: "HK", ceid: "HK:en" },
  SG: { hl: "en", gl: "SG", ceid: "SG:en" },
  // KR/CN/TWはまず英語国際報道をdiscovery入口にし、local-language primary sourceはreview段階で必須確認。
  KR: { hl: "en", gl: "US", ceid: "US:en" },
  CN: { hl: "en", gl: "US", ceid: "US:en" },
  TW: { hl: "en", gl: "US", ceid: "US:en" },
};

const DISCOVERY_MARKETS: ShockMarket[] = ["JP", "US", "UK", "EUROPE", "AU", "CA", "HK", "KR", "SG", "CN", "TW"];

function envQueries(name: string, fallback: string[]): string[] {
  const values = (process.env[name] ?? "")
    .split("|")
    .map(value => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function specs(queries: string[], marketHint: ShockMarket): QuerySpec[] {
  const locale = FEED_LOCALES[marketHint] ?? FEED_LOCALES.US!;
  return queries.map(query => ({ query, marketHint, ...locale }));
}

function configuredSpecs(): QuerySpec[] {
  const defaults: Partial<Record<ShockMarket, string[]>> = {
    JP: JP_QUERIES,
    US: US_QUERIES,
    ...REGIONAL_QUERIES,
  };
  const envNames: Partial<Record<ShockMarket, string>> = {
    JP: "IDIOSYNCRATIC_SHOCK_QUERIES",
    US: "IDIOSYNCRATIC_SHOCK_US_QUERIES",
    UK: "IDIOSYNCRATIC_SHOCK_UK_QUERIES",
    EUROPE: "IDIOSYNCRATIC_SHOCK_EUROPE_QUERIES",
    AU: "IDIOSYNCRATIC_SHOCK_AU_QUERIES",
    CA: "IDIOSYNCRATIC_SHOCK_CA_QUERIES",
    HK: "IDIOSYNCRATIC_SHOCK_HK_QUERIES",
    KR: "IDIOSYNCRATIC_SHOCK_KR_QUERIES",
    SG: "IDIOSYNCRATIC_SHOCK_SG_QUERIES",
    CN: "IDIOSYNCRATIC_SHOCK_CN_QUERIES",
    TW: "IDIOSYNCRATIC_SHOCK_TW_QUERIES",
  };
  return DISCOVERY_MARKETS.flatMap(market => {
    const fallback = defaults[market] ?? [];
    const envName = envNames[market];
    const queries = envName ? envQueries(envName, fallback) : fallback;
    return specs(queries, market);
  });
}

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

async function fetchQuery(spec: QuerySpec): Promise<RssArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(spec.query)}&hl=${spec.hl}&gl=${spec.gl}&ceid=${spec.ceid}`;
  const response = await fetch(url, {
    headers: { "user-agent": "alpha-pon/0.1 idiosyncratic-shock-scanner" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseRss(await response.text(), `Google News RSS ${spec.gl}/${spec.hl}`);
}

function classify(article: RssArticle, rules: RuleConfig, marketHint: ScanMarketHint): ShockScanItem | null {
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
    marketHint,
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
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    if (existing.marketHint !== item.marketHint) existing.marketHint = "UNKNOWN";
    existing.matchedKeywords = [...new Set([...existing.matchedKeywords, ...item.matchedKeywords])];
  }
  return [...byKey.values()];
}

function renderMarkdown(date: string, items: ShockScanItem[], errors: string[]): string {
  const counts = new Map<ScanMarketHint, number>();
  for (const item of items) counts.set(item.marketHint, (counts.get(item.marketHint) ?? 0) + 1);
  const lines = [
    "# 企業固有ショック scan queue",
    "",
    `生成日: ${date}`,
    "",
    "> ここに載るだけでは12点候補ではありません。一次情報確認・context review・10項目採点・実下落・株価沈静化を通過するまで通知禁止。",
    "> marketHintは検索入口のヒントであり、issuer country / incident country / listing marketを確定するものではありません。英語国際報道で拾ったKR/CN/TW等はlocal-language primary sourceをreview段階で必ず確認します。",
    "",
    `- review queue: ${items.length}件`,
    ...DISCOVERY_MARKETS.map(market => `- ${market} hint: ${counts.get(market) ?? 0}`),
    `- UNKNOWN hint: ${counts.get("UNKNOWN") ?? 0}`,
    `- fetch errors: ${errors.length}件`,
    "",
  ];

  const grouped = new Map<string, ShockScanItem[]>();
  for (const item of items) {
    const key = `${item.marketHint}:${item.categoryHint}`;
    const rows = grouped.get(key) ?? [];
    rows.push(item);
    grouped.set(key, rows);
  }
  for (const [group, rows] of grouped) {
    lines.push(`## ${group} (${rows.length})`, "");
    for (const row of rows.slice(0, 15)) {
      lines.push(`- ${row.title}`);
      lines.push(`  - marketHint: ${row.marketHint}`);
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
  const querySpecs = configuredSpecs();
  const items: ShockScanItem[] = [];
  const errors: string[] = [];

  for (const spec of querySpecs) {
    try {
      const articles = await fetchQuery(spec);
      for (const article of articles) {
        const classified = classify(article, rules, spec.marketHint);
        if (classified) items.push(classified);
      }
    } catch (error) {
      errors.push(`${spec.marketHint} ${spec.query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = dedupe(items).slice(0, 600);
  const markets: ScanMarketHint[] = [...DISCOVERY_MARKETS, "UNKNOWN"];
  const byMarket = Object.fromEntries(
    markets.map(market => [market, result.filter(item => item.marketHint === market).length]),
  );
  mkdirSync("reports", { recursive: true });
  const payload = {
    generatedAt: date,
    count: result.length,
    discoveryMarkets: DISCOVERY_MARKETS,
    byMarket,
    items: result,
    errors,
  };
  writeFileSync("reports/idiosyncratic_shock_scan_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(`reports/idiosyncratic_shock_scan_${date}.json`, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_scan_latest.md", renderMarkdown(date, result, errors), "utf-8");
  console.log(`企業固有ショック scan: ${result.length}件 ${DISCOVERY_MARKETS.map(market => `${market}=${byMarket[market] ?? 0}`).join(" ")} UNKNOWN=${byMarket.UNKNOWN ?? 0} errors=${errors.length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
