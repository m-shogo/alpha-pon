// RSS発見キュー + TDnet一次情報キューを一画面にまとめる。
// ここでは点数を推測しない。重要軸が未解決のまま通知へ進めないための人間/agent review queue。
// pnpm queue:shocks

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadActiveShockConfig } from "./idiosyncratic-shock-data.js";
import type { ShockMarket } from "./idiosyncratic-shock-market.js";
import { extractExplicitUsTickerHint } from "./idiosyncratic-shock-us-symbol.js";

type MarketHint = ShockMarket | "UNKNOWN";

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  marketHint?: MarketHint;
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
  marketHint: MarketHint;
  code: string | null;
  symbolHint: string | null;
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

function contextReviewChecklist(marketHint: MarketHint): string[] {
  return [
    `market: ${marketHint} が正しいか。listing marketとissuer countryを分離`,
    "country / incidentCountry: 本社国と事件発生国を別々に確定。海外子会社事件を本社国だけで評価しない",
    "sector / stakeholder / incidentScope: 信用・安全・免許依存業種か、誰が被害者か、個人/店舗/子会社/全社のどこまでか",
    "listingStructure: single/ADR/dual/secondary。ADRや二重上場ならprimary listingの同日反応も確認",
    "ownershipControl: 創業家・政府・親会社・集中所有の支配がactor separability/board独立性を変えないか",
    "liquidityStatus: 売買停止・値幅制限・薄商い中ではないか。価格発見未完ならbottom判定禁止",
    "incidentClusterStatus: 単発か関連複数かcascadeか。追加不祥事の連鎖を単発事件として扱わない",
    "disclosureObservability: 現地IR/取引所/規制当局/報道を十分観測できるか。情報不足を無傷の証拠にしない",
    "confounderStatus: 同時期の決算悪化・guidance・増資・M&A・訴訟判決・sector-wide材料を確認",
    "informationLeakStatus: 公式発表前数営業日の異常下落・噂・訴訟/現地報道先行を確認",
    "recurrenceStatus: 過去5〜10年の類似不祥事・行政処分・内部統制問題の再発歴を確認",
    "remediationStatus: 辞任/謝罪だけでなく、権限・報酬・監査・reporting line・board oversightの実装を確認",
    "incidentRevenueExposurePct: 海外事件なら事件国/地域が売上・利益の何%かを可能な範囲で確認",
    "estimatedDirectCostPctMarketCap: 罰金・返金・休業等の直接損失を時価総額比で規模調整できるか",
    "industryRelativeShockDrawdownPct: broad marketだけでなく同業/sector benchmarkに対して企業固有下落が残るか",
  ];
}

function primaryReviewChecklist(marketHint: MarketHint): string[] {
  return [
    ...contextReviewChecklist(marketHint),
    "investigationStatus: 調査中(open)か、範囲が概ね確定(substantially_complete/closed)か",
    "accountingIntegrity: 財務訂正・架空取引・監査影響の有無",
    "businessImpact: 本業・顧客・規制・営業停止への実害",
    "actorSeparability: 問題人物/少人数を切離せるか",
    "10項目score: 一次情報確認後のみ。国別の道徳点を足さない",
    "shockDrawdownPct: event後20日以内に事件前比-5%以上か",
    "relativeShockDrawdownPct: 現地benchmarkより-3%以上余計に下げたか",
    "priceState: falling/volatileではなくstabilized_after_dropか",
    "一次情報の追加開示予定・次回確認日",
  ];
}

function buildQueue(): QueueItem[] {
  const news = readJson<ScanFile<NewsItem>>(NEWS_PATH)?.items ?? [];
  const disclosures = readJson<ScanFile<DisclosureItem>>(DISCLOSURE_PATH)?.items ?? [];
  const active = loadActiveShockConfig();
  const activeCodes = new Set(active.candidates.map(row => row.code ?? row.symbol).filter((row): row is string => Boolean(row)));
  const activeCompanies = active.candidates.map(row => normalize(row.company));
  const rows: QueueItem[] = [];

  for (const item of disclosures) {
    if (activeCodes.has(item.code)) continue;
    rows.push({
      key: `tdnet:${item.code}:${item.publishedAt}:${titleKey(item.title)}`,
      sourceLevel: "primary",
      marketHint: "JP",
      code: item.code,
      symbolHint: null,
      companyName: item.companyName,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      categoryHint: item.categoryHint,
      actorTypeHint: item.actorTypeHint,
      matchedKeywords: item.matchedKeywords,
      scoringStatus: "needs_scoring",
      requiredReview: primaryReviewChecklist("JP"),
    });
  }

  for (const item of news) {
    const normalizedTitle = normalize(item.title);
    if (activeCompanies.some(name => name && normalizedTitle.includes(name))) continue;
    const marketHint = item.marketHint ?? "UNKNOWN";
    const symbolHint = marketHint === "US" ? extractExplicitUsTickerHint(item.title) : null;
    rows.push({
      key: `news:${marketHint}:${item.publishedAt}:${titleKey(item.title)}`,
      sourceLevel: "news",
      marketHint,
      code: null,
      symbolHint,
      companyName: null,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      categoryHint: item.categoryHint,
      actorTypeHint: item.actorTypeHint,
      matchedKeywords: item.matchedKeywords,
      scoringStatus: "needs_scoring",
      requiredReview: [
        `上場企業・市場・symbolの特定（marketHint=${marketHint} は仮説${symbolHint ? ` / explicit symbolHint=${symbolHint}` : ""}）`,
        marketHint === "US" ? "company IR + SEC EDGAR（8-K/6-K等）の一次情報探索" : "会社・取引所・当局の一次情報探索",
        "symbolHintは見出しに明示された場合だけ。SEC/company IRで実在・会社一致を確認するまで確定しない",
        "噂/誤報/別会社の排除",
        ...contextReviewChecklist(marketHint),
        "investigationStatusの確認",
        "10項目scoreは一次情報確認後のみ。国別の道徳点を足さない",
        "event20日窓のshockDrawdownPct / 現地benchmark相対 / priceStateを銘柄特定後に確認",
      ],
    });
  }

  const deduped = new Map<string, QueueItem>();
  for (const row of rows.sort((a, b) => (a.sourceLevel === "primary" ? -1 : 1) - (b.sourceLevel === "primary" ? -1 : 1))) {
    const key = row.code ? `code:${row.code}:${row.categoryHint}` : `title:${row.marketHint}:${titleKey(row.title)}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }
  return [...deduped.values()];
}

function render(date: string, rows: QueueItem[]): string {
  const primary = rows.filter(row => row.sourceLevel === "primary");
  const news = rows.filter(row => row.sourceLevel === "news");
  const jpNews = news.filter(row => row.marketHint === "JP");
  const usNews = news.filter(row => row.marketHint === "US");
  const unknownNews = news.filter(row => row.marketHint === "UNKNOWN");
  const usSymbolHints = usNews.filter(row => Boolean(row.symbolHint));
  const lines = [
    "# 企業固有ショック 採点待ちキュー",
    "",
    `生成日: ${date}`,
    "",
    "> このキューは情報収集段階です。12点通知へ直接つながりません。",
    "> market / issuer・incident country / listing・ownership / liquidity / incident cluster / disclosure observability / sector / confounder / recurrence / remediation を解決し、一次情報・10項目score・event窓の実下落・現地benchmark/同業相対・沈静化を確認してから active candidate に昇格します。",
    "",
    `- TDnet一次情報(JP): ${primary.length}`,
    `- news JP hint: ${jpNews.length}`,
    `- news US hint: ${usNews.length}`,
    `- US explicit symbol hint: ${usSymbolHints.length}`,
    `- news UNKNOWN hint: ${unknownNews.length}`,
    "",
    "## 1. TDnet/JPX 一次情報 — 優先採点",
    "",
  ];

  if (primary.length === 0) lines.push("- なし", "");
  for (const row of primary.slice(0, 100)) {
    lines.push(`### JP ${row.code} ${row.companyName ?? ""}`);
    lines.push(`- ${row.title}`);
    lines.push(`- categoryHint: ${row.categoryHint} / actor=${row.actorTypeHint}`);
    lines.push(`- matched: ${row.matchedKeywords.join(", ") || "-"}`);
    lines.push(`- url: ${row.url}`);
    lines.push(`- unresolved: ${row.requiredReview.join(" / ")}`);
    lines.push("");
  }

  lines.push("## 2. ニュース発見のみ — 一次情報待ち", "");
  if (news.length === 0) lines.push("- なし", "");
  for (const row of news.slice(0, 150)) {
    lines.push(`- [${row.marketHint}]${row.symbolHint ? ` [symbolHint=${row.symbolHint}]` : ""} ${row.title}`);
    lines.push(`  - categoryHint: ${row.categoryHint} / source=${row.sourceLevel}`);
    lines.push(`  - unresolved: ${row.requiredReview.join(" / ")}`);
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
    contextAware: true,
    newsByMarketHint: {
      JP: rows.filter(row => row.sourceLevel === "news" && row.marketHint === "JP").length,
      US: rows.filter(row => row.sourceLevel === "news" && row.marketHint === "US").length,
      UNKNOWN: rows.filter(row => row.sourceLevel === "news" && row.marketHint === "UNKNOWN").length,
    },
    usExplicitSymbolHints: rows.filter(row => row.sourceLevel === "news" && row.marketHint === "US" && Boolean(row.symbolHint)).length,
    rows,
  };
  writeFileSync("reports/idiosyncratic_shock_review_queue_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_review_queue_latest.md", render(date, rows), "utf-8");
  console.log(`shock review queue: ${rows.length}件 (primary=${payload.primaryCount}, news=${payload.newsCount}, US=${payload.newsByMarketHint.US}, US-symbol=${payload.usExplicitSymbolHints})`);
}

main();
