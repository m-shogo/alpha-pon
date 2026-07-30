// 企業固有ショックの国・法制度コンテキスト。
// 「日本では重い / 米国では軽い」のような文化ステレオタイプを数値化せず、
// 事件カテゴリごとにローカル事例をどの程度重視すべきかと、追加確認軸だけを定義する。

export type ShockJurisdictionGroup = "JP" | "US" | "UK" | "EUROPE" | "COMMONWEALTH" | "OTHER";
export type ShockJurisdictionSensitivity = "high" | "medium" | "low";
export type ShockJurisdictionConfidence = "strong" | "adequate" | "weak";
export type ShockEvidenceTier = "local_strong" | "local_plus_group" | "group_plus_global" | "global_only" | "insufficient";

export type ShockJurisdictionProfile = {
  group: ShockJurisdictionGroup;
  label: string;
  reviewAxes: string[];
  primaryEvidenceHints: string[];
};

export type ShockJurisdictionReview = {
  country: string | null;
  group: ShockJurisdictionGroup;
  sensitivity: ShockJurisdictionSensitivity;
  sameCountryCategoryCases: number;
  sameGroupCategoryCases: number;
  globalCategoryCases: number;
  confidence: ShockJurisdictionConfidence;
  evidenceTier: ShockEvidenceTier;
  evidenceWeights: {
    sameCountry: number;
    sameGroup: number;
    global: number;
  };
  manualReviewRequired: boolean;
  blockers: string[];
  reviewAxes: string[];
};

export const SHOCK_JURISDICTION_PROFILES: Record<ShockJurisdictionGroup, ShockJurisdictionProfile> = {
  JP: {
    group: "JP",
    label: "Japan",
    reviewAxes: [
      "FIEA / 過年度訂正 / 内部統制への波及",
      "JPX/TSE開示・ガバナンス対応",
      "取締役会・指名報酬・子会社統制",
      "顧客・取引先・スポンサーへの実害",
    ],
    primaryEvidenceHints: ["会社IR", "TDnet / JPX", "EDINET / FSA / SESC"],
  },
  US: {
    group: "US",
    label: "United States",
    reviewAxes: [
      "SEC disclosure / restatement / internal-control exposure",
      "board oversight / fiduciary / compensation-clawback exposure",
      "employment-policy / harassment / retaliation exposure",
      "shareholder litigation / regulator / customer impact",
    ],
    primaryEvidenceHints: ["company IR", "SEC EDGAR", "relevant federal/state regulator"],
  },
  UK: {
    group: "UK",
    label: "United Kingdom",
    reviewAxes: [
      "listing / disclosure obligations",
      "board governance and fit-and-proper implications",
      "employment / non-financial misconduct implications",
      "FCA or sector-regulator exposure where applicable",
    ],
    primaryEvidenceHints: ["company RNS/IR", "FCA / relevant regulator", "exchange disclosure"],
  },
  EUROPE: {
    group: "EUROPE",
    label: "Continental Europe",
    reviewAxes: [
      "local securities-market disclosure obligations",
      "local employment/privacy constraints",
      "board / controlling-shareholder governance",
      "national / EU regulator exposure",
    ],
    primaryEvidenceHints: ["company IR", "national regulator", "exchange / EU disclosure"],
  },
  COMMONWEALTH: {
    group: "COMMONWEALTH",
    label: "Australia / Canada common-law markets",
    reviewAxes: [
      "continuous disclosure / exchange obligations",
      "board governance / fiduciary exposure",
      "employment-policy implications",
      "class-action / sector-regulator exposure",
    ],
    primaryEvidenceHints: ["company IR", "exchange disclosure", "national/sector regulator"],
  },
  OTHER: {
    group: "OTHER",
    label: "Unresolved jurisdiction",
    reviewAxes: [
      "local listing/disclosure law",
      "local employment/conduct law",
      "local regulator / licensing exposure",
      "local investor / consumer reaction evidence",
    ],
    primaryEvidenceHints: ["company primary disclosure", "exchange", "local regulator"],
  },
};

const EUROPE_COUNTRIES = new Set([
  "AT", "BE", "CH", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "NL", "NO", "PT", "SE",
]);

export function normalizeShockCountry(country?: string | null, market?: string | null): string | null {
  const value = country?.trim().toUpperCase();
  if (value) {
    if (value === "JAPAN") return "JP";
    if (value === "USA" || value === "UNITED STATES") return "US";
    if (value === "UNITED KINGDOM") return "GB";
    if (value === "AUSTRALIA") return "AU";
    if (value === "CANADA") return "CA";
    return value;
  }
  if (market === "JP") return "JP";
  if (market === "US") return "US";
  if (market === "UK") return "GB";
  if (market === "AU") return "AU";
  if (market === "CA") return "CA";
  return null;
}

export function inferShockJurisdictionGroup(input: {
  country?: string | null;
  market?: string | null;
}): ShockJurisdictionGroup {
  const country = normalizeShockCountry(input.country, input.market);
  if (country === "JP") return "JP";
  if (country === "US") return "US";
  if (country === "GB" || country === "UK") return "UK";
  if (country === "AU" || country === "CA") return "COMMONWEALTH";
  if (country && EUROPE_COUNTRIES.has(country)) return "EUROPE";
  if (input.market === "EUROPE") return "EUROPE";
  return "OTHER";
}

export function shockCategoryJurisdictionSensitivity(category: string): ShockJurisdictionSensitivity {
  const normalized = category.toLowerCase();
  if (
    normalized.includes("relationship") ||
    normalized.includes("sexual") ||
    normalized.includes("harassment") ||
    normalized.includes("statement") ||
    normalized.includes("sabotage") ||
    normalized.includes("viral")
  ) return "high";

  if (
    normalized.includes("accounting") ||
    normalized.includes("restatement") ||
    normalized.includes("fraud") ||
    normalized.includes("quality") ||
    normalized.includes("product_safety") ||
    normalized.includes("organized")
  ) return "low";

  return "medium";
}

export function jurisdictionAnalogyPenalty(input: {
  category: string;
  candidateCountry?: string | null;
  candidateMarket?: string | null;
  historicalCountry?: string | null;
}): number {
  const sensitivity = shockCategoryJurisdictionSensitivity(input.category);
  const candidateCountry = normalizeShockCountry(input.candidateCountry, input.candidateMarket);
  const historicalCountry = normalizeShockCountry(input.historicalCountry, null);

  if (!candidateCountry || !historicalCountry) return sensitivity === "high" ? 2 : sensitivity === "medium" ? 1 : 0;
  if (candidateCountry === historicalCountry) return 0;

  const candidateGroup = inferShockJurisdictionGroup({ country: candidateCountry, market: input.candidateMarket });
  const historicalGroup = inferShockJurisdictionGroup({ country: historicalCountry });
  const sameGroup = candidateGroup === historicalGroup;

  if (sensitivity === "high") return sameGroup ? 2 : 4;
  if (sensitivity === "medium") return sameGroup ? 1 : 2;
  return sameGroup ? 0 : 1;
}

export function temporalAnalogyPenalty(input: {
  category: string;
  candidateDate: string;
  historicalDate: string;
}): number {
  const candidateYear = Number(input.candidateDate.slice(0, 4));
  const historicalYear = Number(input.historicalDate.slice(0, 4));
  if (!Number.isFinite(candidateYear) || !Number.isFinite(historicalYear)) return 0;
  const ageYears = Math.max(0, candidateYear - historicalYear);
  const sensitivity = shockCategoryJurisdictionSensitivity(input.category);

  if (sensitivity === "high") {
    if (ageYears >= 10) return 3;
    if (ageYears >= 6) return 2;
    if (ageYears >= 3) return 1;
    return 0;
  }
  if (sensitivity === "medium") {
    if (ageYears >= 12) return 2;
    if (ageYears >= 7) return 1;
    return 0;
  }
  return ageYears >= 15 ? 1 : 0;
}

function evidencePool(
  sensitivity: ShockJurisdictionSensitivity,
  sameCountry: number,
  sameGroup: number,
  global: number,
): {
  tier: ShockEvidenceTier;
  weights: { sameCountry: number; sameGroup: number; global: number };
  manualReviewRequired: boolean;
} {
  if (sameCountry >= 5) {
    return { tier: "local_strong", weights: { sameCountry: 0.7, sameGroup: 0.2, global: 0.1 }, manualReviewRequired: false };
  }
  if (sameCountry >= 2) {
    return { tier: "local_plus_group", weights: { sameCountry: 0.5, sameGroup: 0.3, global: 0.2 }, manualReviewRequired: false };
  }
  if (sameGroup >= 5) {
    return {
      tier: "group_plus_global",
      weights: { sameCountry: 0.1, sameGroup: 0.6, global: 0.3 },
      manualReviewRequired: sensitivity === "high",
    };
  }
  if (global >= 5) {
    return {
      tier: "global_only",
      weights: { sameCountry: 0, sameGroup: 0.15, global: 0.85 },
      manualReviewRequired: sensitivity !== "low",
    };
  }
  return {
    tier: "insufficient",
    weights: { sameCountry: 0, sameGroup: 0, global: 1 },
    manualReviewRequired: true,
  };
}

export function buildShockJurisdictionReview(
  candidate: { category: string; country?: string | null; market?: string | null },
  historicalCases: Array<{ category: string; country: string }>,
): ShockJurisdictionReview {
  const country = normalizeShockCountry(candidate.country, candidate.market);
  const group = inferShockJurisdictionGroup({ country, market: candidate.market });
  const sensitivity = shockCategoryJurisdictionSensitivity(candidate.category);
  const sameCategory = historicalCases.filter(item => item.category === candidate.category);
  const sameCountryCategoryCases = country == null
    ? 0
    : sameCategory.filter(item => normalizeShockCountry(item.country, null) === country).length;
  const sameGroupCategoryCases = sameCategory.filter(item => (
    inferShockJurisdictionGroup({ country: item.country }) === group
  )).length;
  const globalCategoryCases = sameCategory.length;

  const confidence: ShockJurisdictionConfidence = sameCountryCategoryCases >= 5
    ? "strong"
    : sameCountryCategoryCases >= 2
      ? "adequate"
      : "weak";
  const pool = evidencePool(sensitivity, sameCountryCategoryCases, sameGroupCategoryCases, globalCategoryCases);
  const blockers = pool.manualReviewRequired
    ? [`jurisdiction evidence tier=${pool.tier}; local/context review required before auto-notification`]
    : [];

  return {
    country,
    group,
    sensitivity,
    sameCountryCategoryCases,
    sameGroupCategoryCases,
    globalCategoryCases,
    confidence,
    evidenceTier: pool.tier,
    evidenceWeights: pool.weights,
    manualReviewRequired: pool.manualReviewRequired,
    blockers,
    reviewAxes: SHOCK_JURISDICTION_PROFILES[group].reviewAxes,
  };
}
