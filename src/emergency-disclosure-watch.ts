// TDnet緊急開示ウォッチ。売買推奨ではなく、重要な変化を見逃さないための通知。

import { fetchTdnetDisclosures } from "./fetcher/jpx.js";
import { todayJst } from "./date.js";
import { sendPipelineSummaryNotification } from "./notify.js";

const EMERGENCY_KEYWORDS = [
  "TOB", "公開買付", "MBO", "マネジメント・バイアウト", "完全子会社化",
  "上場廃止", "監理銘柄", "整理銘柄", "特設注意市場銘柄",
  "逮捕", "強制捜査", "不正", "粉飾", "内部統制", "継続企業の前提",
  "決算発表の延期", "決算延期", "有価証券報告書の提出期限延長",
  "第三者割当", "MSワラント", "行使価額修正",
];

function hitKeywords(title: string): string[] {
  return EMERGENCY_KEYWORDS.filter(keyword => title.includes(keyword));
}

function whyImportant(hits: string[]): string {
  if (hits.some(k => ["TOB", "公開買付", "MBO", "完全子会社化"].includes(k))) {
    return "支配権・上場維持・株主構成が変わる可能性がある";
  }
  if (hits.some(k => k.includes("決算") || k.includes("提出期限"))) {
    return "決算信頼性・監査・上場管理リスクを確認する必要がある";
  }
  if (hits.some(k => ["逮捕", "強制捜査", "不正", "粉飾", "内部統制"].includes(k))) {
    return "信用リスクと事業継続リスクが急変する可能性がある";
  }
  if (hits.some(k => k.includes("上場廃止") || k.includes("監理銘柄"))) {
    return "上場維持・流動性・売買制限に直結する可能性がある";
  }
  return "通常の朝刊より優先して一次情報を確認すべき変化";
}

async function main(): Promise<void> {
  const today = todayJst();
  const disclosures = await fetchTdnetDisclosures();
  const items = disclosures
    .map(d => ({ disclosure: d, hits: hitKeywords(d.title) }))
    .filter(item => item.hits.length > 0 && (!item.disclosure.publishedAt || item.disclosure.publishedAt === today))
    .slice(0, 5);

  if (items.length === 0) {
    console.log("緊急通知対象なし");
    return;
  }

  const text = [
    `🚨 Alpha Pon 緊急開示 ${today}`,
    "事実/一次情報ベース。売買推奨なし。",
    "",
    ...items.flatMap(({ disclosure, hits }) => [
      `・${disclosure.code} ${disclosure.companyName}`,
      `  ${disclosure.title}`,
      `  検出: ${hits.join(" / ")}`,
      `  なぜ重要: ${whyImportant(hits)}`,
      "  次に確認: TDnet本文・会社IR・続報の有無",
    ]),
    "",
    "※報道・噂ではなくTDnetタイトル検知。本文確認までは調査メモ扱い。",
  ].join("\n");

  console.log(text);
  await sendPipelineSummaryNotification(text);
}

main().catch(err => {
  console.error("emergency-disclosure-watch failed:", err);
  process.exit(1);
});
