// US企業固有ショックのSEC一次情報review report。
// active US候補 + env指定 + review queueの明示ticker hintについて、SECで実在確認後に8-K/6-K等を収集する。
// pnpm review:shock-sec

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { addDaysJst, todayJst } from "./date.js";
import {
  fetchSecRecentFilings,
  isSecEdgarConfigured,
  resolveSecTicker,
} from "./fetcher/sec-edgar.js";
import { loadActiveShockConfig } from "./idiosyncratic-shock-data.js";
import { inferShockMarket } from "./idiosyncratic-shock-market.js";

type QueueRow = {
  marketHint?: string;
  symbolHint?: string | null;
};

type QueuePayload = { rows?: QueueRow[] };

type SymbolReport = {
  symbol: string;
  sources: string[];
  secCompany: string | null;
  cik: number | null;
  filings: Awaited<ReturnType<typeof fetchSecRecentFilings>>;
  error: string | null;
};

const QUEUE_PATH = "reports/idiosyncratic_shock_review_queue_latest.json";

function addSymbol(result: Map<string, Set<string>>, symbol: string, source: string): void {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return;
  const sources = result.get(normalized) ?? new Set<string>();
  sources.add(source);
  result.set(normalized, sources);
}

function readQueueHints(): string[] {
  if (!existsSync(QUEUE_PATH)) return [];
  try {
    const payload = JSON.parse(readFileSync(QUEUE_PATH, "utf-8")) as QueuePayload;
    return (payload.rows ?? [])
      .filter(row => row.marketHint === "US" && Boolean(row.symbolHint))
      .map(row => row.symbolHint!.toUpperCase());
  } catch {
    return [];
  }
}

function configuredSymbols(): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const active = loadActiveShockConfig().candidates;
  for (const item of active) {
    const market = inferShockMarket({ market: item.market, code: item.code, ticker: item.symbol });
    if (market !== "US" || !item.symbol) continue;
    addSymbol(result, item.symbol, "active");
  }

  const fromEnv = (process.env.SHOCK_SEC_SYMBOLS ?? "")
    .split(",")
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);
  for (const symbol of fromEnv) addSymbol(result, symbol, "env");
  for (const symbol of readQueueHints()) addSymbol(result, symbol, "queue-explicit-hint");
  return result;
}

function render(date: string, configured: boolean, since: string, rows: SymbolReport[]): string {
  const verified = rows.filter(row => row.cik != null && !row.error).length;
  const invalid = rows.filter(row => row.error?.includes("not found in SEC ticker map")).length;
  const lines = [
    "# US企業固有ショック SEC一次情報review",
    "",
    `生成日: ${date}`,
    `- SEC configured: ${configured ? "yes" : "no"}`,
    `- since: ${since}`,
    `- symbols: ${rows.length}`,
    `- SEC verified: ${verified}`,
    `- invalid/unresolved explicit ticker: ${invalid}`,
    "",
    "> SEC提出書類があるだけではscoreを上げません。8-K/6-K等を開き、事件範囲・会計影響・役員交代・規制影響を確認してから採点します。",
    "> review queueのsymbolHintは見出しにtickerが明記された場合だけ抽出し、SEC ticker mapで実在確認できなければ採用しません。",
    "> SEC_USER_AGENT未設定時はfail-closedで取得しません。",
    "",
  ];

  if (!configured) {
    lines.push("## BLOCKED", "", "- `SEC_USER_AGENT` を設定してください。例: `alpha-pon contact@example.com`", "");
  }

  if (rows.length === 0) {
    lines.push("## 対象", "", "- active US候補なし / env指定なし / queueに明示tickerなし", "");
    return lines.join("\n");
  }

  for (const row of rows) {
    lines.push(`## ${row.symbol} (${row.sources.join("+")})`, "");
    if (row.secCompany) lines.push(`- SEC company: ${row.secCompany} / CIK ${row.cik}`);
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
    "- symbolHintの会社がニュース対象会社と一致するか",
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
  const lookbackDays = Math.max(7, Number(process.env.SHOCK_SEC_LOOKBACK_DAYS ?? "120"));
  const since = addDaysJst(date, -lookbackDays);
  const symbols = configuredSymbols();
  const configured = isSecEdgarConfigured();
  const rows: SymbolReport[] = [];

  for (const [symbol, sourceSet] of symbols) {
    const sources = [...sourceSet].sort();
    if (!configured) {
      rows.push({ symbol, sources, secCompany: null, cik: null, filings: [], error: "SEC_USER_AGENT missing" });
      continue;
    }
    try {
      const ticker = await resolveSecTicker(symbol);
      if (!ticker) {
        rows.push({
          symbol,
          sources,
          secCompany: null,
          cik: null,
          filings: [],
          error: "not found in SEC ticker map",
        });
        continue;
      }
      const filings = await fetchSecRecentFilings(symbol, { since, limit: 50 });
      rows.push({
        symbol,
        sources,
        secCompany: ticker.title,
        cik: ticker.cik,
        filings,
        error: null,
      });
    } catch (error) {
      rows.push({
        symbol,
        sources,
        secCompany: null,
        cik: null,
        filings: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const payload = {
    generatedAt: date,
    configured,
    since,
    queuePath: QUEUE_PATH,
    symbols: rows,
  };
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_sec_review_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_sec_review_latest.md", render(date, configured, since, rows), "utf-8");
  console.log(`shock SEC review: configured=${configured} symbols=${rows.length} verified=${rows.filter(row => row.cik != null).length} filings=${rows.reduce((sum, row) => sum + row.filings.length, 0)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
