// 企業固有ショックの市場別カバレッジ / 自動価格判定 readiness。
// 海外株は発見・類似比較できても、信頼できる価格provider未設定なら通知へ進めない。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { isJQuantsConfigured } from "./fetcher/jquants.js";
import { isTwelveDataConfigured } from "./fetcher/twelve-data.js";
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

type NotificationReadiness =
  | "enabled"
  | "blocked_provider_config"
  | "blocked_provider_unimplemented"
  | "no_active_candidates";

type MarketRow = {
  market: ShockMarket;
  label: string;
  benchmark: string;
  automaticPriceProvider: string;
  providerImplemented: boolean;
  providerConfigured: boolean;
  historicalCases: number;
  activeCandidates: number;
  notificationReadiness: NotificationReadiness;
};

function providerConfigured(market: ShockMarket): boolean {
  if (market === "JP") return isJQuantsConfigured();
  if (market === "US") return isTwelveDataConfigured();
  return false;
}

function buildRows(): MarketRow[] {
  const historical = loadHistoricalShockCases();
  const active = loadActiveShockConfig().candidates as ActiveWithMarket[];

  return (Object.keys(SHOCK_MARKET_PROFILES) as ShockMarket[]).map(market => {
    const profile = SHOCK_MARKET_PROFILES[market];
    const historicalCases = historical.filter(item => inferShockMarket({ country: item.country, ticker: item.ticker }) === market).length;
    const activeCandidates = active.filter(item => inferShockMarket({ market: item.market, code: item.code, ticker: item.symbol }) === market).length;
    const configured = providerConfigured(market);
    const notificationReadiness: NotificationReadiness = activeCandidates === 0
      ? "no_active_candidates"
      : !profile.autoPriceEnabled
        ? "blocked_provider_unimplemented"
        : !configured
          ? "blocked_provider_config"
          : "enabled";

    return {
      market,
      label: profile.label,
      benchmark: profile.benchmarkLabel,
      automaticPriceProvider: profile.automaticPriceProvider,
      providerImplemented: profile.autoPriceEnabled,
      providerConfigured: configured,
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
    "> providerが未実装/未設定なら、発見・調査は行ってもLINE通知はfail-closedです。",
    "",
    `- historical total: ${totalHistorical}`,
    `- overseas historical: ${overseasHistorical}`,
    "",
    "| market | historical | active | benchmark | price provider | implemented | configured | notification |",
    "|---|---:|---:|---|---|---|---|---|",
  ];

  for (const row of rows) {
    lines.push(`| ${row.market} | ${row.historicalCases} | ${row.activeCandidates} | ${row.benchmark} | ${row.automaticPriceProvider} | ${row.providerImplemented ? "yes" : "no"} | ${row.providerConfigured ? "yes" : "no"} | ${row.notificationReadiness} |`);
  }

  lines.push(
    "",
    "## 方針",
    "",
    "- JP: J-Quants + TOPIX。J-Quants設定済みの場合だけ自動価格判定。",
    "- US: Twelve Data + S&P 500 proxy。`TWELVE_DATA_API_KEY` 設定済みの場合だけ自動価格判定。",
    "- UK / EUROPE / AU / CA: 過去類似には利用するが、price provider未実装中は通知しない。",
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
    methodology: "common event scoring; market-specific price/benchmark gate; unsupported or unconfigured markets fail closed",
    rows,
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_market_readiness_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_market_readiness_latest.md", render(date, rows), "utf-8");
  console.log(`shock market readiness: ${rows.map(row => `${row.market}=${row.historicalCases}/${row.notificationReadiness}`).join(" ")}`);
}

main();
