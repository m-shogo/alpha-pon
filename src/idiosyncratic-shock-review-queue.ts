// RSS発見キュー + TDnet一次情報キューを一画面にまとめる。
// ここでは点数を推測しない。重要3軸が未解決のまま通知へ進めないための人間/agent review queue。
// pnpm queue:shocks

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadActiveShockConfig } from "./idiosyncratic-shock-data.js";

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  categoryHint: string;
  categoryLabel: string;
  actorTypeHint: string;
  matchedKeywords: string[];
};

type DisclosureItem = {
  code: string;
  companyName: string;
  title: string;
  publishedAt: string;
  url: string;
  categoryHint: string;
  categoryLabel: string;
  actorTypeHint: string;
  matchedKeywords: string[];
};

type ScanFile<T> = { generatedAt: string; items: T[]; error?: string | null; errors?: string[] };

type QueueItem = {
  key: string;
  sourceLevel: "primary" | "news";
  code: string | null;
  companyName: string | null;
  title: string;
  url: string;
  publishedAt: string;
  categoryHint: string;
  actorTypeHint: string;
  matchedKeywords: string[];
  scoringStatus: "needs_scoring";
  requiredReview: string[];
};

const NEWS_PATH = "reports/idiosyncratic_shock_scan_latest.json";
const DISCLOSURE_PATH = "reports/idiosyncratic_shock_disclosures_latest.json";

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")) as T; } catch { return null; }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s　・,，.。()（）「」『』【】［］]/g, "");
}

function titleKey(title: string): string {
  return normalize(title).slice(0, 100);
}

function buildQueue(): QueueItem[] {
  const news = readJson<ScanFile<NewsItem>>(NEWS_PATH)?.items ?? [];
  const disclosures = readJson<ScanFile<DisclosureItem>>(DISCLOSURE_PATH)?.items ?? [];
  const active = loadActiveShockConfig();
  const activeCodes = new Set(active.candidates.map(row => row.code).filter((row): row is string => Boolean(row)));
  const activeCompanies = active.candidates.map(row => normalize(row.company));
  const rows: QueueItem[] = [];

  for (const item of disclosures) {
    if (activeCodes.has(item.code)) continue;
    rows.push({
      key: `tdnet:${item.code}:${item.publishedAt}:${titleKey(item.title)}`,
      sourceLevel: "primary",
      code: item.code,
      companyName: item.companyName,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      categoryHint: item.categoryHint,
      actorTypeHint: item.actorTypeHint,
      matchedKeywords: item.matchedKeywords,
      scoringStatus: "needs_scoring",
      requiredReview: [
        "事件の範囲（個人/複数/組織）",
        "会計影響の有無",
        "本業・顧客・規制への実害",
        "問題人物の切離し可能性",
        "J-Quants株価下落率と沈静化",
      ],
    });
  }

  for (const item of news) {
    const normalizedTitle = normalize(item.title);
    if (activeCompanies.some(name => name && normalizedTitle.includes(name))) continue;
    rows.push({
      key: `news:${item.publishedAt}:${titleKey(item.title)}`,
      sourceLevel: "news",
      code: null,
      companyName: null,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      categoryHint: item.categoryHint,
      actorTypeHint: item.actorTypeHint,
      matchedKeywords: item.matchedKeywords,
      scoringStatus: "needs_scoring",
      requiredReview: [
        "上場企業/証券コードの特定",
        "会社・取引所・当局の一次情報探索",
        "噂/誤報/別会社の排除",
        "10項目scoreは一次情報確認後のみ",
      ],
    });
  }

  const deduped = new Map<string, QueueItem>();
  // 一次情報を先に残す。ニュース同士はタイトルで重複排除。
  for (const row of rows.sort((a, b) => (a.sourceLevel === "primary" ? -1 : 1) - (b.sourceLevel === "primary" ? -1 : 1))) {
    const key = row.code ? `code:${row.code}:${row.categoryHint}` : `title:${titleKey(row.title)}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return [...deduped.values()];
}

function render(date: string, rows: QueueItem[]): string {
  const primary = rows.filter(row => row.sourceLevel === "primary");
  const news = rows.filter(row => row.sourceLevel === "news");
  const lines = [
    "# 企業固有ショック 採点待ちキュー",
    "",
    `生成日: ${date}`,
    "",
    "> このキューは情報収集段階です。12点通知へ直接つながりません。",
    "> 一次情報で accounting / organization / separability を解決してから active candidate に昇格します。",
    "",
    `- TDnet一次情報: ${primary.length}`,
    `- news-only: ${news.length}`,
    "",
    "## 1. TDnet/JPX 一次情報 — 優先採点",
    "",
  ];

  if (primary.length === 0) lines.push("- なし", "");
  for (const row of primary.slice(0, 100)) {
    lines.push(`### ${row.code} ${row.companyName ?? ""}`);
    lines.push(`- ${row.title}`);
    lines.push(`- categoryHint: ${row.categoryHint} / actor=${row.actorTypeHint}`);
    lines.push(`- matched: ${row.matchedKeywords.join(", ") || "-"}`);
    lines.push(`- url: ${row.url}`);
    lines.push("");
  }

  lines.push("## 2. ニュース発見のみ — 一次情報待ち", "");
  if (news.length === 0) lines.push("- なし", "");
  for (const row of news.slice(0, 100)) {
    lines.push(`- ${row.title}`);
    lines.push(`  - categoryHint: ${row.categoryHint} / source=${row.sourceLevel}`);
    lines.push(`  - url: ${row.url}`);
  }
  return lines.join("\n");
}

function main(): void {
  const date = todayJst();
  const rows = buildQueue();
  mkdirSync("reports", { recursive: true });
  const payload = {
    generatedAt: date,
    count: rows.length,
    primaryCount: rows.filter(row => row.sourceLevel === "primary").length,
    newsCount: rows.filter(row => row.sourceLevel === "news").length,
    rows,
  };
  writeFileSync("reports/idiosyncratic_shock_review_queue_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_review_queue_latest.md", render(date, rows), "utf-8");
  console.log(`shock review queue: ${rows.length}件 (primary=${payload.primaryCount}, news=${payload.newsCount})`);
}

main();
