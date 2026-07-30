export type ShockMarket = "JP" | "US" | "UK" | "EUROPE" | "AU" | "CA" | "OTHER";

export type ShockAutomaticPriceProvider = "jquants" | "unconfigured";

export type ShockMarketProfile = {
  market: ShockMarket;
  label: string;
  benchmarkLabel: string;
  automaticPriceProvider: ShockAutomaticPriceProvider;
  autoPriceEnabled: boolean;
};

export const SHOCK_MARKET_PROFILES: Record<ShockMarket, ShockMarketProfile> = {
  JP: {
    market: "JP",
    label: "Japan",
    benchmarkLabel: "TOPIX",
    automaticPriceProvider: "jquants",
    autoPriceEnabled: true,
  },
  US: {
    market: "US",
    label: "United States",
    benchmarkLabel: "S&P 500",
    automaticPriceProvider: "unconfigured",
    autoPriceEnabled: false,
  },
  UK: {
    market: "UK",
    label: "United Kingdom",
    benchmarkLabel: "FTSE 100",
    automaticPriceProvider: "unconfigured",
    autoPriceEnabled: false,
  },
  EUROPE: {
    market: "EUROPE",
    label: "Europe",
    benchmarkLabel: "STOXX Europe 600",
    automaticPriceProvider: "unconfigured",
    autoPriceEnabled: false,
  },
  AU: {
    market: "AU",
    label: "Australia",
    benchmarkLabel: "S&P/ASX 200",
    automaticPriceProvider: "unconfigured",
    autoPriceEnabled: false,
  },
  CA: {
    market: "CA",
    label: "Canada",
    benchmarkLabel: "S&P/TSX Composite",
    automaticPriceProvider: "unconfigured",
    autoPriceEnabled: false,
  },
  OTHER: {
    market: "OTHER",
    label: "Other",
    benchmarkLabel: "broad-market benchmark unresolved",
    automaticPriceProvider: "unconfigured",
    autoPriceEnabled: false,
  },
};

const EUROPE_COUNTRIES = new Set([
  "AT", "BE", "CH", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "NL", "NO", "PT", "SE",
]);

export function inferShockMarket(input: {
  market?: ShockMarket | null;
  country?: string | null;
  code?: string | null;
  ticker?: string | null;
}): ShockMarket {
  if (input.market) return input.market;

  const country = input.country?.trim().toUpperCase() ?? "";
  if (country === "JP" || country === "JAPAN") return "JP";
  if (country === "US" || country === "USA" || country === "UNITED STATES") return "US";
  if (country === "GB" || country === "UK" || country === "UNITED KINGDOM") return "UK";
  if (country === "AU" || country === "AUSTRALIA") return "AU";
  if (country === "CA" || country === "CANADA") return "CA";
  if (EUROPE_COUNTRIES.has(country)) return "EUROPE";

  if (input.code && /^\d{4}$/.test(input.code)) return "JP";
  if (input.ticker && /^\d{4}$/.test(input.ticker)) return "JP";
  return "OTHER";
}

export function shockMarketProfile(market: ShockMarket): ShockMarketProfile {
  return SHOCK_MARKET_PROFILES[market];
}

export function shockBenchmarkLabel(market: ShockMarket): string {
  return shockMarketProfile(market).benchmarkLabel;
}

export function supportsAutomaticShockPrice(market: ShockMarket): boolean {
  return shockMarketProfile(market).autoPriceEnabled;
}
