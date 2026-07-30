// 企業固有ショックの市場別カバレッジ / 自動価格判定 readiness。
// 海外株は発見・類似比較できても、信頼できる価格provider未設定なら通知へ進めない。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadActiveShockConfig, loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import {
  SHOCK_MARKET_PROFILES,
  inferShockMarket,
  type ShockMarket,
} from "./idiosyncratic-shock-market.js";

type ActiveWithMarket = ReturnType<typeof loadActiveShockConfig>["candidates"][number] & {
  market?: ShockMarket;
  symbol?: string | null;
};

type MarketRow = {
  market: ShockMarket;
  label: string;
  benchmark: string;
  automaticPriceProvider: string;
  autoPriceEnabled: boolean;
  historicalCases: number;
  activeCandidates: number;
  notificationReadiness: "enabled" | "blocked_price_provider" | "no_active_candidates";
};

function buildRows(): MarketRow[] {
  const historical = loadHistoricalShockCases();
  const active = loadActiveShockConfig().candidates as ActiveWithMarket[];

  return (Object.keys(SHOCK_MARKET_PROFILES) as ShockMarket[]).map(market => {
    const profile = SHOCK_MARKET_PROFILES[market];
    const historicalCases = historical.filter(item => inferShockMarket({ country: item.country, ticker: item.ticker }) === market).length;
    const activeCandidates = active.filter(item => inferShockMarket({ market: item.market, code: item.code, ticker: item.symbol }) === market).length;
    const notificationReadiness = activeCandidates === 0
      ? "no_active_candidates"
      : profile.autoPriceEnabled
        ? "enabled"
        : "blocked_price_provider";

    return {
      market,
      label: profile.label,
      benchmark: profile.benchmarkLabel,
      automaticPriceProvider: profile.automaticPriceProvider,
      autoPriceEnabled: profile.autoPriceEnabled,
      historicalCases,
      activeCandidates,
      notificationReadiness,
    };
  });
}

function render(date: string, rows: MarketRow[]): string {
  const totalHistorical = rows.reduce((sum, row) => sum + row.historicalCases, 0);
  const overseasHistorical = rows.filter(row => row.market !== "JP").reduce((sum, row) => sum + row.historicalCases, 0);
  const lines = [
    "# 企業固有ショック 市場別readiness",
    "",
    `生成日: ${date}`,
    "",
    "> 事件構造のスコアと過去類似は世界共通。価格ショックと地合い比較だけ市場別に判定します。",
    "> 海外市場は信頼できる価格providerが未設定の間、発見・調査は行ってもLINE通知はfail-closedです。",
    "",
    `- historical total: ${totalHistorical}`,
    `- overseas historical: ${overseasHistorical}`,
    "",
    "| market | historical | active | benchmark | price provider | notification |",
    "|---|---:|---:|---|---|---|",
  ];

  for (const row of rows) {
    lines.push(`| ${row.market} | ${row.historicalCases} | ${row.activeCandidates} | ${row.benchmark} | ${row.automaticPriceProvider} | ${row.notificationReadiness} |`);
  }

  lines.push(
    "",
    "## 方針",
    "",
    "- JP: J-Quants + TOPIXで自動価格判定を継続。",
    "- US: 次の優先市場。S&P 500相対で判定し、価格provider導入後に自動通知を解禁。",
    "- UK / EUROPE / AU / CA: 過去類似には利用するが、価格provider未設定中は通知しない。",
    "- 海外の見出しだけで10項目scoreへ自動昇格しない。会社IR・規制当局・取引所等の一次情報を確認する。",
    "- 為替変動は企業固有ショック判定には混ぜない。株価は現地通貨ベース、市場benchmarkも同一市場・同一通貨で比較する。",
  );
  return lines.join("\n");
}

function main(): void {
  const date = todayJst();
  const rows = buildRows();
  const payload = {
    generatedAt: date,
    methodology: "common event scoring; market-specific price/benchmark gate; unsupported markets fail closed",
    rows,
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_market_readiness_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_market_readiness_latest.md", render(date, rows), "utf-8");
  console.log(`shock market readiness: ${rows.map(row => `${row.market}=${row.historicalCases}/${row.notificationReadiness}`).join(" ")}`);
}

main();
