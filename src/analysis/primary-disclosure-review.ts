import type { EdinetDoc } from "../fetcher/edinet.js";
import { toSecCode } from "../fetcher/edinet.js";
import type { TdnetDisclosure } from "../fetcher/jpx.js";
import type { Candidate, PrimaryDisclosureCategory, PrimaryDisclosureItem, PrimaryDisclosureReview } from "../types.js";

const CATEGORY_KEYWORDS: Array<{
  category: PrimaryDisclosureCategory;
  positive: string[];
  caution: string[];
  blocker: string[];
}> = [
  {
    category: "earnings",
    positive: ["決算短信", "四半期決算", "通期決算", "決算発表"],
    caution: ["営業利益", "経常利益", "親会社株主に帰属する当期純利益"],
    blocker: [],
  },
  {
    category: "upward_revision",
    positive: ["上方修正", "業績予想の修正", "配当予想の修正", "増配"],
    caution: [],
    blocker: [],
  },
  {
    category: "downward_revision",
    positive: [],
    caution: ["業績予想の修正", "配当予想の修正"],
    blocker: ["下方修正", "減配", "営業損失", "赤字転落", "特別損失", "減損損失"],
  },
  {
    category: "midterm_plan",
    positive: ["中期経営計画", "中計", "事業計画", "成長戦略"],
    caution: [],
    blocker: [],
  },
  {
    category: "large_order",
    positive: ["大型受注", "受注", "契約締結", "業務提携", "資本業務提携"],
    caution: [],
    blocker: [],
  },
  {
    category: "buyback",
    positive: ["自己株式取得", "自己株式の取得", "自社株買い", "自己株式消却"],
    caution: [],
    blocker: [],
  },
  {
    category: "share_issuance",
    positive: [],
    caution: ["第三者割当", "新株予約権", "公募増資", "売出し", "株式の売出し"],
    blocker: ["希薄化", "MSワラント", "行使価額修正", "有償第三者割当"],
  },
  {
    category: "scandal",
    positive: [],
    caution: ["調査委員会", "特別調査委員会", "社内調査", "行政処分", "訴訟", "不正", "情報漏えい"],
    blocker: ["不祥事", "粉飾", "訂正報告書", "監理銘柄", "上場廃止", "内部統制", "過年度決算訂正"],
  },
  {
    category: "ma",
    positive: ["TOB", "公開買付", "M&A", "株式取得", "子会社化", "合併"],
    caution: ["事業譲渡", "子会社株式の譲渡", "持分法適用会社"],
    blocker: [],
  },
  {
    category: "restructuring",
    positive: ["会社分割", "吸収分割", "新設分割", "スピンオフ", "事業再編"],
    caution: ["希望退職", "構造改革", "固定資産の譲渡"],
    blocker: ["債務超過", "継続企業の前提", "GC注記"],
  },
  {
    category: "dividend",
    positive: ["増配", "配当予想の修正", "株主還元"],
    caution: ["減配", "無配"],
    blocker: [],
  },
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

function normalizeCode(code: string): string {
  return code.replace(/\.T$/, "").trim();
}

function edinetMatchesCandidate(doc: EdinetDoc, candidate: Candidate): boolean {
  const secCode = toSecCode(candidate.code);
  const normalizedCode = normalizeCode(candidate.code);
  return doc.secCode === secCode || doc.secCode === normalizedCode || doc.secCode.startsWith(normalizedCode);
}

function classifyText(text: string): { category: PrimaryDisclosureCategory; severity: "positive" | "neutral" | "caution" | "blocker"; reasons: string[] } {
  const hits: Array<{ category: PrimaryDisclosureCategory; severity: "positive" | "neutral" | "caution" | "blocker"; reason: string }> = [];

  for (const rule of CATEGORY_KEYWORDS) {
    if (includesAny(text, rule.blocker)) hits.push({ category: rule.category, severity: "blocker", reason: `${rule.category}: blocker keyword` });
    if (includesAny(text, rule.caution)) hits.push({ category: rule.category, severity: "caution", reason: `${rule.category}: caution keyword` });
    if (includesAny(text, rule.positive)) hits.push({ category: rule.category, severity: "positive", reason: `${rule.category}: positive/primary keyword` });
  }

  if (hits.length === 0) return { category: "other", severity: "neutral", reasons: [] };

  const severityRank = { blocker: 4, caution: 3, positive: 2, neutral: 1 } as const;
  hits.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  const top = hits[0]!;
  return {
    category: top.category,
    severity: top.severity,
    reasons: [...new Set(hits.map(hit => hit.reason))].slice(0, 6),
  };
}

function tdnetItem(disclosure: TdnetDisclosure): PrimaryDisclosureItem {
  const classified = classifyText(disclosure.title);
  return {
    source: "TDnet",
    code: disclosure.code,
    companyName: disclosure.companyName,
    title: disclosure.title,
    publishedAt: disclosure.publishedAt,
    url: disclosure.url,
    category: classified.category,
    severity: classified.severity,
    reasons: classified.reasons,
  };
}

function edinetItem(doc: EdinetDoc): PrimaryDisclosureItem {
  const text = `${doc.docDescription} ${doc.currentReportReason}`;
  const classified = classifyText(text);
  return {
    source: "EDINET",
    code: doc.secCode,
    companyName: doc.filerName,
    title: doc.docDescription || doc.currentReportReason || doc.docID,
    publishedAt: doc.submitDateTime,
    url: `https://disclosure.edinet-fsa.go.jp/api/v2/documents/${doc.docID}?type=1`,
    category: classified.category,
    severity: classified.severity,
    reasons: classified.reasons,
  };
}

function sortItems(items: PrimaryDisclosureItem[]): PrimaryDisclosureItem[] {
  const rank = { blocker: 0, caution: 1, positive: 2, neutral: 3 } as const;
  return [...items].sort((a, b) => rank[a.severity] - rank[b.severity] || b.publishedAt.localeCompare(a.publishedAt));
}

export function buildPrimaryDisclosureReview(input: {
  candidate: Candidate;
  tdnetDisclosures: TdnetDisclosure[];
  edinetDocs: EdinetDoc[];
  fetchErrors?: string[];
}): PrimaryDisclosureReview {
  const code = normalizeCode(input.candidate.code);
  const tdnet = input.tdnetDisclosures
    .filter(disclosure => normalizeCode(disclosure.code) === code)
    .map(tdnetItem);
  const edinet = input.edinetDocs
    .filter(doc => edinetMatchesCandidate(doc, input.candidate))
    .map(edinetItem);
  const items = sortItems([...tdnet, ...edinet]);
  const blockers = items
    .filter(item => item.severity === "blocker")
    .map(item => `${item.source}: ${item.title}`)
    .slice(0, 8);
  const warnings = [
    ...items.filter(item => item.severity === "caution").map(item => `${item.source}: ${item.title}`),
    ...(input.fetchErrors ?? []).map(error => `一次情報取得エラー: ${error}`),
  ].slice(0, 10);
  const positives = items
    .filter(item => item.severity === "positive")
    .map(item => `${item.source}: ${item.title}`)
    .slice(0, 8);
  const evidenceNeeded = [
    "TDnet/EDINETの本文PDFでタイトル分類が正しいか確認する",
    "下方修正・増資・不祥事・継続企業注記がないか確認する",
    "ニュース材料は一次情報で裏取りできるまで仮説扱いにする",
  ];

  const hasPrimarySource = items.length > 0;
  const decision = blockers.length > 0
    ? "block"
    : warnings.length > 0
      ? "caution"
      : hasPrimarySource
        ? "confirmed"
        : "missing";

  return {
    sourceCoverage: {
      tdnetCount: tdnet.length,
      edinetCount: edinet.length,
      hasPrimarySource,
    },
    decision,
    items: items.slice(0, 20),
    positives,
    warnings,
    blockers,
    evidenceNeeded,
  };
}
