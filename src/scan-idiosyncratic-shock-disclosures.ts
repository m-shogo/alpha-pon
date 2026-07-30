// TDnet / JPX開示から企業固有ショックの一次情報候補を抽出する。
// RSSは発見用、こちらは一次情報確認用。タイトル一致だけでscoreは自動付与しない。
// pnpm scan:shock-disclosures

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { fetchTdnetDisclosures, type TdnetDisclosure } from "./fetcher/jpx.js";
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

type DisclosureCandidate = TdnetDisclosure & {
  categoryHint: string;
  categoryLabel: string;
  actorTypeHint: string;
  matchedKeywords: string[];
  evidenceStatus: "confirmed";
  sourceType: "exchange";
  reviewStatus: "needs_scoring";
  autoScoreAllowed: false;
  autoNotificationEligible: false;
};

const GOVERNANCE_DISCLOSURE_HINTS = [
  "不適切",
  "不正",
  "調査委員会",
  "第三者委員会",
  "特別調査委員会",
  "コンプライアンス",
  "法令違反",
  "役員",
  "取締役",
  "執行役員",
  "社長",
  "会長",
  "CEO",
  "辞任",
  "解任",
  "逮捕",
  "起訴",
  "報酬",
  "横領",
  "着服",
  "改ざん",
  "偽装",
  "自主回収",
  "行政処分",
  "再発防止",
];

function classify(disclosure: TdnetDisclosure, rules: RuleConfig): DisclosureCandidate | null {
  const text = `${disclosure.companyName} ${disclosure.title}`;
  if (isMacroDriven(text, rules.macroExclusions)) return null;
  if (!GOVERNANCE_DISCLOSURE_HINTS.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))) return null;

  let best: { id: string; label: string; actorType: string; matched: string[] } | null = null;
  for (const category of rules.categories) {
    const matched = category.keywords.filter(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matched.length) {
      best = { id: category.id, label: category.label, actorType: category.defaultActorType, matched };
    }
  }

  // 「不適切」「調査委員会」等だけで拾えたものも落とさず、分類は保留する。
  const category = best ?? {
    id: "organizational_governance",
    label: "組織的ガバナンス問題（要分類）",
    actorType: "unknown",
    matched: GOVERNANCE_DISCLOSURE_HINTS.filter(keyword => text.includes(keyword)).slice(0, 5),
  };

  return {
    ...disclosure,
    categoryHint: category.id,
    categoryLabel: category.label,
    actorTypeHint: category.actorType,
    matchedKeywords: category.matched,
    evidenceStatus: "confirmed",
    sourceType: "exchange",
    reviewStatus: "needs_scoring",
    autoScoreAllowed: false,
    autoNotificationEligible: false,
  };
}

function dedupe(items: DisclosureCandidate[]): DisclosureCandidate[] {
  const map = new Map<string, DisclosureCandidate>();
  for (const item of items) {
    const key = `${item.code}:${item.publishedAt}:${item.title}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function renderMarkdown(date: string, items: DisclosureCandidate[], error: string | null): string {
  const lines = [
    "# 企業固有ショック TDnet一次情報キュー",
    "",
    `生成日: ${date}`,
    "",
    "> TDnet/JPX開示は evidenceStatus=confirmed として扱えますが、タイトルだけでは10項目scoreを自動決定しません。",
    "> score付与後も priceState=stabilized_after_drop になるまで通知しません。",
    "",
    `- candidates: ${items.length}`,
    `- error: ${error ?? "none"}`,
    "",
  ];

  for (const item of items.slice(0, 100)) {
    lines.push(`## ${item.code} ${item.companyName}`);
    lines.push(`- ${item.title}`);
    lines.push(`- date: ${item.publishedAt}`);
    lines.push(`- categoryHint: ${item.categoryHint}`);
    lines.push(`- matched: ${item.matchedKeywords.join(", ") || "generic governance hint"}`);
    lines.push(`- url: ${item.url}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const date = todayJst();
  const rules = load(readFileSync("config/idiosyncratic-shock-rules.yml", "utf-8")) as RuleConfig;
  let items: DisclosureCandidate[] = [];
  let error: string | null = null;

  try {
    const disclosures = await fetchTdnetDisclosures();
    items = dedupe(disclosures.map(row => classify(row, rules)).filter((row): row is DisclosureCandidate => row !== null));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  mkdirSync("reports", { recursive: true });
  const payload = { generatedAt: date, count: items.length, items, error };
  writeFileSync("reports/idiosyncratic_shock_disclosures_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(`reports/idiosyncratic_shock_disclosures_${date}.json`, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_disclosures_latest.md", renderMarkdown(date, items, error), "utf-8");
  console.log(`企業固有ショック TDnet: ${items.length}件${error ? ` / error=${error}` : ""}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
