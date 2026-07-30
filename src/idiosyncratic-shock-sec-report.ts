// US企業固有ショックのSEC一次情報review report。
// active US候補 + SHOCK_SEC_SYMBOLSで指定したsymbolについて、最近の8-K/6-K等を収集する。
// pnpm review:shock-sec

import { mkdirSync, writeFileSync } from "fs";
import { addDaysJst, todayJst } from "./date.js";
import { fetchSecRecentFilings, isSecEdgarConfigured } from "./fetcher/sec-edgar.js";
import { loadActiveShockConfig } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";

type ActiveWithMarket = ReturnType<typeof loadActiveShockConfig>["candidates"][number] & {
  market?: ShockMarket;
  symbol?: string | null;
};

type SymbolReport = {
  symbol: string;
  source: "active" | "env" | "active+env";
  filings: Awaited<ReturnType<typeof fetchSecRecentFilings>>;
  error: string | null;
};

function configuredSymbols(): Map<string, SymbolReport["source"]> {
  const result = new Map<string, SymbolReport["source"]>();
  const active = loadActiveShockConfig().candidates as ActiveWithMarket[];
  for (const item of active) {
    const market = inferShockMarket({ market: item.market, code: item.code, ticker: item.symbol });
    if (market !== "US" || !item.symbol) continue;
    result.set(item.symbol.toUpperCase(), "active");
  }

  const fromEnv = (process.env.SHOCK_SEC_SYMBOLS ?? "")
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);
  for (const symbol of fromEnv) {
    result.set(symbol, result.has(symbol) ? "active+env" : "env");
  }
  return result;
}

function render(date: string, configured: boolean, since: string, rows: SymbolReport[]): string {
  const lines = [
    "# US企業固有ショック SEC一次情報review",
    "",
    `生成日: ${date}`,
    `- SEC configured: ${configured ? "yes" : "no"}`,
    `- since: ${since}`,
    `- symbols: ${rows.length}`,
    "",
    "> SEC提出書類があるだけではscoreを上げません。8-K/6-K等を開き、事件範囲・会計影響・役員交代・規制影響を確認してから採点します。",
    "> SEC_USER_AGENT未設定時はfail-closedで取得しません。",
    "",
  ];

  if (!configured) {
    lines.push("## BLOCKED", "", "- `SEC_USER_AGENT` を設定してください。例: `alpha-pon contact@example.com`", "");
  }

  if (rows.length === 0) {
    lines.push("## 対象", "", "- active US候補なし / `SHOCK_SEC_SYMBOLS` 未指定", "");
    return lines.join("\n");
  }

  for (const row of rows) {
    lines.push(`## ${row.symbol} (${row.source})`, "");
    if (row.error) {
      lines.push(`- error: ${row.error}`, "");
      continue;
    }
    if (row.filings.length === 0) {
      lines.push("- 対象期間の主要提出書類なし", "");
      continue;
    }
    for (const filing of row.filings) {
      lines.push(`- ${filing.filingDate} ${filing.form}: ${filing.primaryDocumentDescription ?? filing.primaryDocument}`);
      lines.push(`  - company: ${filing.company}`);
      lines.push(`  - url: ${filing.filingUrl}`);
    }
    lines.push("");
  }

  lines.push(
    "## review項目",
    "",
    "- CEO/役員辞任・解任の理由は個人行動か、事業/財務問題か",
    "- restatement / internal control / unrecorded payment等の会計論点はないか",
    "- DOJ / SEC / FTC / 州当局等の調査・処分へ広がっていないか",
    "- 事件範囲はclosed/substantially_completeと判断できるか",
    "- guidanceや業績への直接影響が会社から説明されているか",
    "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const date = todayJst();
  const lookbackDays = Math.max(7, Number(process.env.SHock_SEC_LOOKBACK_DAYS ?? process.env.SHOCK_SEC_LOOKBACK_DAYS ?? "120"));
  const since = addDaysJst(date, -lookbackDays);
  const symbols = configuredSymbols();
  const configured = isSecEdgarConfigured();
  const rows: SymbolReport[] = [];

  for (const [symbol, source] of symbols) {
    if (!configured) {
      rows.push({ symbol, source, filings: [], error: "SEC_USER_AGENT missing" });
      continue;
    }
    try {
      const filings = await fetchSecRecentFilings(symbol, { since, limit: 50 });
      rows.push({ symbol, source, filings, error: null });
    } catch (error) {
      rows.push({
        symbol,
        source,
        filings: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const payload = {
    generatedAt: date,
    configured,
    since,
    symbols: rows,
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_sec_review_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_sec_review_latest.md", render(date, configured, since, rows), "utf-8");
  console.log(`shock SEC review: configured=${configured} symbols=${rows.length} filings=${rows.reduce((sum, row) => sum + row.filings.length, 0)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
