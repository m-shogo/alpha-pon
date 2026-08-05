// USニュース見出しから「明示されたticker」だけを抽出する。
// 社名からtickerを推測しない。active昇格前にSEC/company IRで実在・対象会社を確認する。

const RESERVED = new Set([
  "CEO", "CFO", "COO", "SEC", "DOJ", "FTC", "USA", "USD", "IPO", "ETF", "AI", "EPS",
]);

function cleanSymbol(value: string): string | null {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,7}$/.test(symbol)) return null;
  if (RESERVED.has(symbol)) return null;
  return symbol;
}

export function extractExplicitUsTickerHint(text: string): string | null {
  const patterns = [
    /\b(?:NASDAQ|NYSE|NYSEARCA|AMEX)\s*:\s*([A-Z][A-Z0-9.-]{0,7})\b/i,
    /\$([A-Z][A-Z0-9.-]{0,7})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const symbol = match?.[1] ? cleanSymbol(match[1]) : null;
    if (symbol) return symbol;
  }
  return null;
}
