import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

type PriceRow = {
  code?: string;
  publicPrice?: number | null;
  initialPrice?: number | null;
  reviewPrice?: number | null;
  topixRelativeReturn?: number | null;
};

type TopixRow = {
  code?: string;
  listingTopix?: number | null;
  reviewTopix?: number | null;
};

const PRICE_CSV = process.env.LISTING_REVIEW_PRICE_CSV ?? "data/listing_review_prices.csv";
const TOPIX_CSV = process.env.LISTING_TOPIX_CSV ?? "data/listing_topix.csv";
const OUT_CSV = process.env.LISTING_REVIEW_PRICE_CSV ?? "data/listing_review_prices.csv";

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseCsvRows(path: string): Record<string, string>[] {
  if (!existsSync(path)) return [];
  const [headerLine, ...rows] = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  const headers = headerLine.split(",").map(h => h.trim());
  return rows.map(row => {
    const cols = row.split(",").map(v => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return obj;
  });
}

function readPrices(): PriceRow[] {
  return parseCsvRows(PRICE_CSV).map(row => ({
    code: row.code,
    publicPrice: parseNumber(row.publicPrice),
    initialPrice: parseNumber(row.initialPrice),
    reviewPrice: parseNumber(row.reviewPrice),
    topixRelativeReturn: parseNumber(row.topixRelativeReturn),
  }));
}

function readTopix(): TopixRow[] {
  return parseCsvRows(TOPIX_CSV).map(row => ({ code: row.code, listingTopix: parseNumber(row.listingTopix), reviewTopix: parseNumber(row.reviewTopix) }));
}

function stockReturn(row: PriceRow): number | null {
  if (row.publicPrice == null || row.reviewPrice == null || row.publicPrice === 0) return null;
  return (row.reviewPrice - row.publicPrice) / row.publicPrice;
}

function topixReturn(row: TopixRow | undefined): number | null {
  if (!row || row.listingTopix == null || row.reviewTopix == null || row.listingTopix === 0) return null;
  return (row.reviewTopix - row.listingTopix) / row.listingTopix;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = todayJst();
  const prices = readPrices();
  const topix = readTopix();
  const topixByCode = new Map(topix.map(row => [row.code, row]));
  const updated = prices.map(row => {
    const sr = stockReturn(row);
    const tr = topixReturn(topixByCode.get(row.code));
    return { ...row, topixRelativeReturn: sr == null || tr == null ? row.topixRelativeReturn ?? null : sr - tr };
  });
  const missing = updated.filter(row => row.topixRelativeReturn == null);
  const lines: string[] = [];

  lines.push("# TOPIX相対リターン計算", "", `date: ${generatedAt}`, "");
  lines.push("> 買い推奨ではありません。上場後レビューのTOPIX相対リターンをCSVから計算します。", "");
  lines.push(`- priceCsv: ${PRICE_CSV}`);
  lines.push(`- topixCsv: ${TOPIX_CSV}`);
  lines.push(`- write: ${write}`);
  lines.push(`- rows: ${updated.length}`);
  lines.push(`- missingTopixRelativeReturn: ${missing.length}`, "");
  if (!existsSync(TOPIX_CSV)) {
    lines.push("## setup needed", "");
    lines.push("data/listing_topix.csv を用意してください。", "");
    lines.push("```csv");
    lines.push("code,listingTopix,reviewTopix");
    lines.push("285A,2800,2940");
    lines.push("```");
  }
  lines.push("## rows", "");
  for (const row of updated) lines.push(`- ${row.code ?? "no-code"} / topixRelativeReturn=${row.topixRelativeReturn ?? "missing"}`);

  if (write) {
    mkdirSync("data", { recursive: true });
    const csv = ["code,publicPrice,initialPrice,reviewPrice,topixRelativeReturn", ...updated.map(row => [row.code, row.publicPrice, row.initialPrice, row.reviewPrice, row.topixRelativeReturn].map(csvEscape).join(","))].join("\n") + "\n";
    writeFileSync(OUT_CSV, csv, "utf-8");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_topix_relative_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_topix_relative_latest.json", JSON.stringify({ generatedAt, rows: updated }, null, 2), "utf-8");
  console.log(`listing topix relative generated: rows=${updated.length}, write=${write}`);
}

main();
