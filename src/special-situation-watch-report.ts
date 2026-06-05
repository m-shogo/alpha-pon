// 特殊状況・時間差再評価ウォッチレポート生成
// carve-out / PE出口 / spin-off / lockup / cycle recovery 等の王道パターンを
// 調査優先候補・監視候補として蓄積し、チャンス候補を TOP / 通知向けに出す。
// 売買推奨ではない。
//
// pnpm watch:special

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import type { HypothesisOutcome } from "./universe.js";

// ─────────── 型定義 ───────────

const ALLOWED_FINAL_LABELS = [
  "構造監視候補",
  "チャンス候補",
  "調査優先候補",
  "需給待ち",
  "市況待ち",
  "初回決算待ち",
  "ロックアップ待ち",
  "証拠不足",
  "罠注意",
  "避ける",
] as const;
type FinalLabel = typeof ALLOWED_FINAL_LABELS[number];

const ALLOWED_CHANCE_LEVELS = ["none", "watch", "attention", "high"] as const;
type ChanceLevel = typeof ALLOWED_CHANCE_LEVELS[number];

const ALLOWED_WATCH_PHASES = [
  "pre_listing",
  "ipo_week",
  "first_earnings_wait",
  "lockup_wait",
  "sell_pressure_clearing",
  "cycle_confirmation",
  "fundamental_confirmation",
  "watch_only",
] as const;
type WatchPhase = typeof ALLOWED_WATCH_PHASES[number];

const ALLOWED_RISK_LEVELS = ["low", "medium", "high", "unknown"] as const;
type RiskLevel = typeof ALLOWED_RISK_LEVELS[number];

const ALLOWED_CONFIDENCE = ["official", "reported", "rumor", "unknown"] as const;
type Confidence = typeof ALLOWED_CONFIDENCE[number];

const ALLOWED_SELLER_TYPES = [
  "parent_company",
  "pe_fund",
  "government",
  "founder",
  "strategic_holder",
  "multiple",
  "none",
  "unknown",
] as const;
type SellerType = typeof ALLOWED_SELLER_TYPES[number];

const ALLOWED_SELLER_MOTIVATIONS = [
  "fund_exit",
  "debt_reduction",
  "policy_sale",
  "portfolio_rebalance",
  "business_reorganization",
  "business_deterioration",
  "liquidity_event",
  "none",
  "unknown",
] as const;
type SellerMotivation = typeof ALLOWED_SELLER_MOTIVATIONS[number];

const ALLOWED_REMAINING_OVERHANG = ["cleared", "low", "medium", "high", "unknown"] as const;
type RemainingOverhang = typeof ALLOWED_REMAINING_OVERHANG[number];

const ALLOWED_THEME_WAS_RIGHT = ["unknown", "too_early", "right", "wrong", "mixed"] as const;
type ThemeWasRight = typeof ALLOWED_THEME_WAS_RIGHT[number];

const ALLOWED_SELECTED_COMPANY_FIT = ["unknown", "too_early", "strong", "medium", "weak", "wrong_company"] as const;
type SelectedCompanyFit = typeof ALLOWED_SELECTED_COMPANY_FIT[number];

const ALLOWED_BETTER_COMPANY_RELATION = [
  "more_direct_beneficiary",
  "better_margin_exposure",
  "less_overhang",
  "better_liquidity",
  "already_priced_in",
  "unknown",
] as const;
type BetterCompanyRelation = typeof ALLOWED_BETTER_COMPANY_RELATION[number];

type ThemeCompanyFitReview = {
  themeId: string;
  themeLabel: string;
  themeWasRight: ThemeWasRight;
  selectedCompanyFit: SelectedCompanyFit;
  fitSummary: string;
  whyThemeMayBeRight: string[];
  whyCompanyMayBeWrong: string[];
  betterCompanyCandidates: Array<{
    code: string;
    name: string;
    reason: string;
    relation: BetterCompanyRelation;
  }>;
  evidenceNeeded: string[];
};

type SellerPressureProfile = {
  sellerType: SellerType;
  sellerName: string | null;
  sellerMotivation: SellerMotivation;
  remainingOverhang: RemainingOverhang;
  estimatedClearedAt: string | null;
  whyItMatters: string[];
  evidenceNeeded: string[];
};

type PatternRule = {
  id: string;
  label: string;
  description: string;
  whyInteresting?: string[];
  whyDangerous?: string[];
  evidenceNeeded?: string[];
};

type ListingInfoConfig = {
  listedAt?: string | null;
  plannedListingAt?: string | null;
  ipoPrice?: number | null;
  firstPrice?: number | null;
  lockupExpiryAt?: string | null;
  firstEarningsAt?: string | null;
  source?: string | null;
  sourceCheckedAt?: string | null;
  confidence?: Confidence;
};

type CandidateConfig = {
  code: string;
  name: string;
  patterns: string[];
  watchPhase: WatchPhase;
  finalLabel: FinalLabel;
  chanceLevel: ChanceLevel;
  reasonSummary: string;
  parentOrSponsor?: string | null;
  sellerPressure?: RiskLevel;
  lockupRisk?: RiskLevel;
  debtRisk?: RiskLevel;
  capexRisk?: RiskLevel;
  cycleRisk?: RiskLevel;
  dilutionRisk?: RiskLevel;
  waitFor?: string[];
  /** なぜ今見るのか */
  whyNow?: string[];
  /** なぜ今はまだ待つのか */
  whyNotNow?: string[];
  sellerPressureProfile?: Partial<SellerPressureProfile>;
  themeCompanyFitReview?: Partial<ThemeCompanyFitReview> & {
    betterCompanyCandidates?: Array<{
      code: string;
      name: string;
      reason: string;
      relation?: string;
    }>;
  };
  listingInfo?: ListingInfoConfig;
  smallTicket?: {
    price?: number | null;
    minimumAmount?: number | null;
    isSmallTicket?: boolean;
    caution?: string[];
  };
};

type ReferenceEventConfig = {
  eventName: string;
  companyName: string;
  eventType:
    | "ipo_watch"
    | "listing_plan"
    | "listing_day"
    | "lockup"
    | "first_earnings"
    | "funding"
    | "regulation";
  plannedDate?: string | null;
  actualDate?: string | null;
  confidence: Confidence;
  source?: string | null;
  sourceCheckedAt?: string | null;
  relatedThemes?: string[];
  relatedJapaneseCompanies?: string[];
};

type SpecialSituationConfig = {
  version: number;
  description: string;
  defaultAction: string;
  neverTreatAs: string[];
  safetyRules?: string[];
  patterns: PatternRule[];
  candidates: CandidateConfig[];
  referenceEvents?: ReferenceEventConfig[];
  outcomeStats?: { minSampleSize?: number };
};

type OutcomeStats = {
  sampleSize: number;
  sampleTooSmall: boolean;
  hitRate: number | null;
  avgReturn1w: number | null;
  avgReturn1m: number | null;
  avgTopixRelative1m: number | null;
};

type SpecialSituationCandidate = {
  code: string;
  name: string;
  patterns: string[];
  watchPhase: WatchPhase;
  finalLabel: FinalLabel;
  chanceLevel: ChanceLevel;
  notificationEligible: boolean;

  reasonSummary: string;
  whyInteresting: string[];
  whyDangerous: string[];
  evidenceNeeded: string[];
  waitFor: string[];
  /** なぜ今見るのか */
  whyNow: string[];
  /** なぜ今はまだ待つのか */
  whyNotNow: string[];

  parentOrSponsor: string | null;
  sellerPressure: RiskLevel;
  sellerPressureProfile: SellerPressureProfile;
  lockupRisk: RiskLevel;
  debtRisk: RiskLevel;
  capexRisk: RiskLevel;
  cycleRisk: RiskLevel;
  dilutionRisk: RiskLevel;

  listingInfo?: {
    listedAt?: string | null;
    plannedListingAt?: string | null;
    ipoPrice?: number | null;
    firstPrice?: number | null;
    lockupExpiryAt?: string | null;
    firstEarningsAt?: string | null;
    source?: string | null;
    sourceCheckedAt?: string | null;
    confidence: Confidence;
  };

  smallTicket?: {
    price: number | null;
    minimumAmount: number | null;
    isSmallTicket: boolean;
    caution: string[];
  };

  themeCompanyFitReview: ThemeCompanyFitReview;
  outcomeStats?: OutcomeStats;
};

type TopChanceItem = {
  code: string;
  name: string;
  finalLabel: FinalLabel;
  chanceLevel: ChanceLevel;
  reasonSummary: string;
  topReasons: string[];
  mainRisks: string[];
  nextCheck: string[];
  /** なぜ今見るのか（最大2件） */
  whyNow: string[];
  /** なぜ今はまだ待つのか（最大2件） */
  whyNotNow: string[];
  sellerPressureSummary?: {
    sellerType: string;
    sellerName: string | null;
    remainingOverhang: string;
    topRisk: string | null;
  };
  themeCompanyFitSummary?: {
    themeLabel: string;
    selectedCompanyFit: string;
    fitSummary: string;
    betterCompanyCodes: string[];
  };
  listingInfo?: {
    listedAt?: string | null;
    plannedListingAt?: string | null;
    lockupExpiryAt?: string | null;
    firstEarningsAt?: string | null;
    confidence: Confidence;
  };
};

type ReferenceEvent = ReferenceEventConfig;

const ALLOWED_OUTCOME_GROUP_TYPES = [
  "pattern",
  "watchPhase",
  "finalLabel",
  "chanceLevel",
  "sellerOverhang",
  "themeWasRight",
  "selectedCompanyFit",
  "themeCompanyFit",
] as const;
type OutcomeGroupType = typeof ALLOWED_OUTCOME_GROUP_TYPES[number];

type SpecialSituationOutcomeStats = {
  groupType: OutcomeGroupType;
  groupKey: string;
  sampleSize: number;
  sampleTooSmall: boolean;
  hitRate: number | null;
  avgReturn1w: number | null;
  avgReturn1m: number | null;
  avgTopixRelative1m: number | null;
  note: string;
};

type SpecialSituationWatchReport = {
  generatedAt: string;
  defaultAction: string;
  neverTreatAs: string[];
  safetyRules: string[];
  patterns: Array<{
    id: string;
    label: string;
    description: string;
    whyInteresting: string[];
    whyDangerous: string[];
    evidenceNeeded: string[];
  }>;
  candidates: SpecialSituationCandidate[];
  topChanceList: TopChanceItem[];
  referenceEvents: ReferenceEvent[];
  outcomeStats: SpecialSituationOutcomeStats[];
};

// ─────────── ヘルパ ───────────

function readYaml<T>(path: string): T {
  return load(readFileSync(path, "utf-8")) as T;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function hitRate(rows: HypothesisOutcome[]): number | null {
  const judged = rows.filter(r => r.result === "hit" || r.result === "miss");
  if (judged.length === 0) return null;
  return judged.filter(r => r.result === "hit").length / judged.length;
}

function fallbackRisk(value: RiskLevel | undefined): RiskLevel {
  return value ?? "unknown";
}

function fallbackConfidence(value: Confidence | undefined): Confidence {
  return value ?? "unknown";
}

function fmtPct(value: number | null): string {
  if (value == null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

// ─────────── 統計 ───────────

function buildOutcomeStatsForCode(
  code: string,
  outcomes: HypothesisOutcome[],
  minSampleSize: number
): OutcomeStats {
  const rows = outcomes.filter(o => o.code === code);
  return {
    sampleSize: rows.length,
    sampleTooSmall: rows.length < minSampleSize,
    hitRate: hitRate(rows),
    avgReturn1w: avg(rows.map(r => r.return1w)),
    avgReturn1m: avg(rows.map(r => r.return1m)),
    avgTopixRelative1m: avg(rows.map(r => r.relativeToTopix1m)),
  };
}

// ─────────── 候補組み立て ───────────

function buildCandidate(
  config: CandidateConfig,
  patterns: PatternRule[],
  outcomes: HypothesisOutcome[],
  minSampleSize: number
): SpecialSituationCandidate {
  const patternIds = new Set(config.patterns ?? []);
  const matchedPatterns = patterns.filter(p => patternIds.has(p.id));

  // パターン由来の理由・リスク・evidence を集約 (重複除去)
  const whyInteresting = uniq(matchedPatterns.flatMap(p => p.whyInteresting ?? []));
  const whyDangerous = uniq(matchedPatterns.flatMap(p => p.whyDangerous ?? []));
  const evidenceNeeded = uniq(matchedPatterns.flatMap(p => p.evidenceNeeded ?? []));

  // ラベル検証
  if (!ALLOWED_FINAL_LABELS.includes(config.finalLabel)) {
    throw new Error(`不正な finalLabel: ${config.finalLabel} (code=${config.code})`);
  }
  if (!ALLOWED_CHANCE_LEVELS.includes(config.chanceLevel)) {
    throw new Error(`不正な chanceLevel: ${config.chanceLevel} (code=${config.code})`);
  }
  if (!ALLOWED_WATCH_PHASES.includes(config.watchPhase)) {
    throw new Error(`不正な watchPhase: ${config.watchPhase} (code=${config.code})`);
  }

  const stats = buildOutcomeStatsForCode(config.code, outcomes, minSampleSize);

  // 通知資格判定
  // - finalLabel が チャンス候補/調査優先候補
  // - chanceLevel が attention/high
  // - whyDangerous(リスク) が空でない
  // - evidenceNeeded が空でない
  // - whyNotNow が空でない（今待つ理由なしで通知しない）
  // - sampleTooSmall=true は強い通知にしない
  // sellerPressureProfile 組み立て
  const rawSpp = config.sellerPressureProfile ?? {};
  const sellerType = (ALLOWED_SELLER_TYPES as readonly string[]).includes(rawSpp.sellerType ?? "")
    ? rawSpp.sellerType as SellerType
    : "unknown";
  const sellerMotivation = (ALLOWED_SELLER_MOTIVATIONS as readonly string[]).includes(rawSpp.sellerMotivation ?? "")
    ? rawSpp.sellerMotivation as SellerMotivation
    : "unknown";
  const remainingOverhang = (ALLOWED_REMAINING_OVERHANG as readonly string[]).includes(rawSpp.remainingOverhang ?? "")
    ? rawSpp.remainingOverhang as RemainingOverhang
    : "unknown";
  const sellerPressureProfile: SellerPressureProfile = {
    sellerType,
    sellerName: rawSpp.sellerName ?? null,
    sellerMotivation,
    remainingOverhang,
    estimatedClearedAt: rawSpp.estimatedClearedAt ?? null,
    whyItMatters: rawSpp.whyItMatters ?? [],
    evidenceNeeded: rawSpp.evidenceNeeded ?? [],
  };

  // themeCompanyFitReview 組み立て
  const rawFit = config.themeCompanyFitReview ?? {};
  const themeWasRight = (ALLOWED_THEME_WAS_RIGHT as readonly string[]).includes(rawFit.themeWasRight ?? "")
    ? rawFit.themeWasRight as ThemeWasRight
    : "unknown";
  const selectedCompanyFit = (ALLOWED_SELECTED_COMPANY_FIT as readonly string[]).includes(rawFit.selectedCompanyFit ?? "")
    ? rawFit.selectedCompanyFit as SelectedCompanyFit
    : "unknown";
  const themeCompanyFitReview: ThemeCompanyFitReview = {
    themeId: rawFit.themeId ?? "",
    themeLabel: rawFit.themeLabel ?? "",
    themeWasRight,
    selectedCompanyFit,
    fitSummary: rawFit.fitSummary ?? "",
    whyThemeMayBeRight: rawFit.whyThemeMayBeRight ?? [],
    whyCompanyMayBeWrong: rawFit.whyCompanyMayBeWrong ?? [],
    betterCompanyCandidates: (rawFit.betterCompanyCandidates ?? []).map(c => ({
      code: c.code,
      name: c.name,
      reason: c.reason,
      relation: (ALLOWED_BETTER_COMPANY_RELATION as readonly string[]).includes(c.relation ?? "")
        ? c.relation as BetterCompanyRelation
        : "unknown",
    })),
    evidenceNeeded: rawFit.evidenceNeeded ?? [],
  };

  // 通知資格判定
  // - finalLabel が チャンス候補/調査優先候補
  // - chanceLevel が attention/high
  // - whyDangerous(リスク) が空でない
  // - evidenceNeeded が空でない
  // - whyNotNow が空でない（今待つ理由なしで通知しない）
  // - sampleTooSmall=true は強い通知にしない
  // - remainingOverhang high は通知しない（TOP監視のみ）
  // - selectedCompanyFit が weak/wrong_company は通知しない
  // - themeWasRight が wrong は通知しない
  // - themeWasRight が too_early は high 通知しない
  const eligibleLabels: readonly FinalLabel[] = ["チャンス候補", "調査優先候補"];
  const eligibleLevels: readonly ChanceLevel[] = ["attention", "high"];
  const whyNow = config.whyNow ?? [];
  const whyNotNow = config.whyNotNow ?? [];
  const fitBlocksNotification =
    selectedCompanyFit === "weak" ||
    selectedCompanyFit === "wrong_company" ||
    themeWasRight === "wrong" ||
    (themeWasRight === "too_early" && config.chanceLevel === "high");
  const notificationEligible =
    eligibleLabels.includes(config.finalLabel) &&
    eligibleLevels.includes(config.chanceLevel) &&
    whyDangerous.length > 0 &&
    evidenceNeeded.length > 0 &&
    whyNotNow.length > 0 &&
    remainingOverhang !== "high" &&
    !stats.sampleTooSmall &&
    !fitBlocksNotification;

  const listingInfo = config.listingInfo
    ? {
        listedAt: config.listingInfo.listedAt ?? null,
        plannedListingAt: config.listingInfo.plannedListingAt ?? null,
        ipoPrice: config.listingInfo.ipoPrice ?? null,
        firstPrice: config.listingInfo.firstPrice ?? null,
        lockupExpiryAt: config.listingInfo.lockupExpiryAt ?? null,
        firstEarningsAt: config.listingInfo.firstEarningsAt ?? null,
        source: config.listingInfo.source ?? null,
        sourceCheckedAt: config.listingInfo.sourceCheckedAt ?? null,
        confidence: fallbackConfidence(config.listingInfo.confidence),
      }
    : undefined;

  const smallTicket = config.smallTicket
    ? {
        price: config.smallTicket.price ?? null,
        minimumAmount: config.smallTicket.minimumAmount ?? null,
        isSmallTicket: config.smallTicket.isSmallTicket ?? false,
        caution: config.smallTicket.caution ?? [
          "単価の低さを割安と誤認しないこと",
          "流動性・最低売買金額を確認すること",
        ],
      }
    : undefined;

  return {
    code: config.code,
    name: config.name,
    patterns: config.patterns ?? [],
    watchPhase: config.watchPhase,
    finalLabel: config.finalLabel,
    chanceLevel: config.chanceLevel,
    notificationEligible,
    reasonSummary: config.reasonSummary,
    whyInteresting,
    whyDangerous,
    evidenceNeeded,
    waitFor: config.waitFor ?? [],
    whyNow: config.whyNow ?? [],
    whyNotNow: config.whyNotNow ?? [],
    parentOrSponsor: config.parentOrSponsor ?? null,
    sellerPressure: fallbackRisk(config.sellerPressure),
    sellerPressureProfile,
    themeCompanyFitReview,
    lockupRisk: fallbackRisk(config.lockupRisk),
    debtRisk: fallbackRisk(config.debtRisk),
    capexRisk: fallbackRisk(config.capexRisk),
    cycleRisk: fallbackRisk(config.cycleRisk),
    dilutionRisk: fallbackRisk(config.dilutionRisk),
    listingInfo,
    smallTicket,
    outcomeStats: stats,
  };
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}

function buildTopChanceList(candidates: SpecialSituationCandidate[]): TopChanceItem[] {
  // chanceLevel の優先順位順 + notificationEligible 優先
  const levelOrder: Record<ChanceLevel, number> = { high: 0, attention: 1, watch: 2, none: 3 };
  return candidates
    .filter(c =>
      c.chanceLevel === "high" ||
      c.chanceLevel === "attention" ||
      c.finalLabel === "チャンス候補" ||
      c.finalLabel === "調査優先候補" ||
      c.finalLabel === "構造監視候補"
    )
    .sort((a, b) => {
      const lv = levelOrder[a.chanceLevel] - levelOrder[b.chanceLevel];
      if (lv !== 0) return lv;
      // 通知資格を優先
      return Number(b.notificationEligible) - Number(a.notificationEligible);
    })
    .map(c => ({
      code: c.code,
      name: c.name,
      finalLabel: c.finalLabel,
      chanceLevel: c.chanceLevel,
      reasonSummary: c.reasonSummary,
      topReasons: c.whyInteresting.slice(0, 3),
      mainRisks: c.whyDangerous.slice(0, 3),
      nextCheck: c.waitFor.length > 0 ? c.waitFor.slice(0, 4) : c.evidenceNeeded.slice(0, 4),
      whyNow: c.whyNow.slice(0, 2),
      whyNotNow: c.whyNotNow.slice(0, 2),
      sellerPressureSummary: c.sellerPressureProfile.sellerType !== "none"
        ? {
            sellerType: c.sellerPressureProfile.sellerType,
            sellerName: c.sellerPressureProfile.sellerName,
            remainingOverhang: c.sellerPressureProfile.remainingOverhang,
            topRisk: c.sellerPressureProfile.whyItMatters[0] ?? null,
          }
        : undefined,
      themeCompanyFitSummary: c.themeCompanyFitReview.themeLabel
        ? {
            themeLabel: c.themeCompanyFitReview.themeLabel,
            selectedCompanyFit: c.themeCompanyFitReview.selectedCompanyFit,
            fitSummary: c.themeCompanyFitReview.fitSummary,
            betterCompanyCodes: c.themeCompanyFitReview.betterCompanyCandidates.slice(0, 2).map(b => b.code),
          }
        : undefined,
      listingInfo: c.listingInfo
        ? {
            listedAt: c.listingInfo.listedAt ?? null,
            plannedListingAt: c.listingInfo.plannedListingAt ?? null,
            lockupExpiryAt: c.listingInfo.lockupExpiryAt ?? null,
            firstEarningsAt: c.listingInfo.firstEarningsAt ?? null,
            confidence: c.listingInfo.confidence,
          }
        : undefined,
    }));
}

// ─────────── レポート生成 ───────────

/** 候補のコード集合から outcomes を絞り込み、集計行を1件作る */
function buildOneOutcomeStat(
  groupType: OutcomeGroupType,
  groupKey: string,
  codes: string[],
  outcomes: HypothesisOutcome[],
  minSampleSize: number
): SpecialSituationOutcomeStats {
  const codeSet = new Set(codes);
  const rows = outcomes.filter(o => codeSet.has(o.code));
  const size = rows.length;
  const tooSmall = size < minSampleSize;
  const judged = rows.filter(r => r.result === "hit" || r.result === "miss");
  const hitRateVal = judged.length === 0 ? null : judged.filter(r => r.result === "hit").length / judged.length;
  const avgRet1w = avg(rows.map(r => r.return1w));
  const avgRet1m = avg(rows.map(r => r.return1m));
  const avgTopix = avg(rows.map(r => r.relativeToTopix1m));
  const note = tooSmall
    ? `サンプル不足(${size}件)。参考値のみ・強い判断に使わない。`
    : `${size}件のアウトカムから集計。`;
  return { groupType, groupKey, sampleSize: size, sampleTooSmall: tooSmall, hitRate: hitRateVal, avgReturn1w: avgRet1w, avgReturn1m: avgRet1m, avgTopixRelative1m: avgTopix, note };
}

function buildSpecialSituationOutcomeStats(
  candidates: SpecialSituationCandidate[],
  outcomes: HypothesisOutcome[],
  minSampleSize: number
): SpecialSituationOutcomeStats[] {
  const stats: SpecialSituationOutcomeStats[] = [];

  // pattern別
  const patternMap = new Map<string, string[]>();
  for (const c of candidates) {
    for (const p of c.patterns) {
      if (!patternMap.has(p)) patternMap.set(p, []);
      patternMap.get(p)!.push(c.code);
    }
  }
  for (const [key, codes] of patternMap) {
    stats.push(buildOneOutcomeStat("pattern", key, codes, outcomes, minSampleSize));
  }

  // watchPhase別
  const phaseMap = new Map<string, string[]>();
  for (const c of candidates) {
    if (!phaseMap.has(c.watchPhase)) phaseMap.set(c.watchPhase, []);
    phaseMap.get(c.watchPhase)!.push(c.code);
  }
  for (const [key, codes] of phaseMap) {
    stats.push(buildOneOutcomeStat("watchPhase", key, codes, outcomes, minSampleSize));
  }

  // finalLabel別
  const labelMap = new Map<string, string[]>();
  for (const c of candidates) {
    if (!labelMap.has(c.finalLabel)) labelMap.set(c.finalLabel, []);
    labelMap.get(c.finalLabel)!.push(c.code);
  }
  for (const [key, codes] of labelMap) {
    stats.push(buildOneOutcomeStat("finalLabel", key, codes, outcomes, minSampleSize));
  }

  // chanceLevel別
  const chanceMap = new Map<string, string[]>();
  for (const c of candidates) {
    if (!chanceMap.has(c.chanceLevel)) chanceMap.set(c.chanceLevel, []);
    chanceMap.get(c.chanceLevel)!.push(c.code);
  }
  for (const [key, codes] of chanceMap) {
    stats.push(buildOneOutcomeStat("chanceLevel", key, codes, outcomes, minSampleSize));
  }

  // sellerOverhang別
  const overhangMap = new Map<string, string[]>();
  for (const c of candidates) {
    const key = c.sellerPressureProfile.remainingOverhang;
    if (!overhangMap.has(key)) overhangMap.set(key, []);
    overhangMap.get(key)!.push(c.code);
  }
  for (const [key, codes] of overhangMap) {
    stats.push(buildOneOutcomeStat("sellerOverhang", key, codes, outcomes, minSampleSize));
  }

  // themeWasRight別
  const themeRightMap = new Map<string, string[]>();
  for (const c of candidates) {
    const key = c.themeCompanyFitReview.themeWasRight;
    if (!themeRightMap.has(key)) themeRightMap.set(key, []);
    themeRightMap.get(key)!.push(c.code);
  }
  for (const [key, codes] of themeRightMap) {
    stats.push(buildOneOutcomeStat("themeWasRight", key, codes, outcomes, minSampleSize));
  }

  // selectedCompanyFit別
  const fitMap = new Map<string, string[]>();
  for (const c of candidates) {
    const key = c.themeCompanyFitReview.selectedCompanyFit;
    if (!fitMap.has(key)) fitMap.set(key, []);
    fitMap.get(key)!.push(c.code);
  }
  for (const [key, codes] of fitMap) {
    stats.push(buildOneOutcomeStat("selectedCompanyFit", key, codes, outcomes, minSampleSize));
  }

  return stats;
}

function buildReport(config: SpecialSituationConfig): SpecialSituationWatchReport {
  const minSampleSize = config.outcomeStats?.minSampleSize ?? 5;
  const outcomes = readJsonl<HypothesisOutcome>("data/hypothesis_outcomes.jsonl");

  const candidates = (config.candidates ?? []).map(c =>
    buildCandidate(c, config.patterns, outcomes, minSampleSize)
  );

  const topChanceList = buildTopChanceList(candidates);

  const referenceEvents: ReferenceEvent[] = (config.referenceEvents ?? []).map(ev => ({
    eventName: ev.eventName,
    companyName: ev.companyName,
    eventType: ev.eventType,
    plannedDate: ev.plannedDate ?? null,
    actualDate: ev.actualDate ?? null,
    confidence: fallbackConfidence(ev.confidence),
    source: ev.source ?? null,
    sourceCheckedAt: ev.sourceCheckedAt ?? null,
    relatedThemes: ev.relatedThemes ?? [],
    relatedJapaneseCompanies: ev.relatedJapaneseCompanies ?? [],
  }));

  return {
    generatedAt: todayJst(),
    defaultAction: config.defaultAction,
    neverTreatAs: config.neverTreatAs,
    safetyRules: config.safetyRules ?? [],
    patterns: config.patterns.map(p => ({
      id: p.id,
      label: p.label,
      description: p.description,
      whyInteresting: p.whyInteresting ?? [],
      whyDangerous: p.whyDangerous ?? [],
      evidenceNeeded: p.evidenceNeeded ?? [],
    })),
    candidates,
    topChanceList,
    referenceEvents,
    outcomeStats: buildSpecialSituationOutcomeStats(candidates, outcomes, minSampleSize),
  };
}

// ─────────── Markdown レンダリング ───────────

function renderMarkdown(report: SpecialSituationWatchReport): string {
  const lines: string[] = [];
  lines.push("# alpha-pon 特殊状況・時間差再評価ウォッチ", "");
  lines.push(`date: ${report.generatedAt}`, "");
  lines.push("> carve-out / PE出口 / spin-off / lockup / cycle recovery 等の王道パターンを、調査優先候補・監視候補として蓄積します。買い推奨ではありません。証拠確認が必要です。", "");

  lines.push("## default action", "");
  lines.push(`- ${report.defaultAction}`, "");

  lines.push("## never treat as", "");
  for (const item of report.neverTreatAs) lines.push(`- ${item}`);
  lines.push("");

  if (report.safetyRules.length > 0) {
    lines.push("## safety rules", "");
    for (const item of report.safetyRules) lines.push(`- ${item}`);
    lines.push("");
  }

  // TOP チャンス候補
  lines.push("## TOP: チャンス候補・調査優先候補（売買推奨ではありません）", "");
  if (report.topChanceList.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const item of report.topChanceList) {
      const conf = item.listingInfo?.confidence ? ` [${item.listingInfo.confidence}]` : "";
      lines.push(`### 【${item.finalLabel}】${item.code} ${item.name} (chanceLevel: ${item.chanceLevel})${conf}`);
      lines.push(`- 理由: ${item.reasonSummary}`);
      if (item.topReasons.length > 0) {
        lines.push("- なぜチャンスっぽいか:");
        for (const r of item.topReasons) lines.push(`  - ${r}`);
      }
      if (item.mainRisks.length > 0) {
        lines.push("- 主なリスク:");
        for (const r of item.mainRisks) lines.push(`  - ${r}`);
      }
      if (item.whyNow.length > 0) {
        lines.push("- なぜ今見るのか:");
        for (const r of item.whyNow) lines.push(`  - ${r}`);
      }
      if (item.whyNotNow.length > 0) {
        lines.push("- なぜまだ待つのか:");
        for (const r of item.whyNotNow) lines.push(`  - ${r}`);
      }
      if (item.whyNow.length > 0) {
        lines.push(`- なぜ今見るのか: ${item.whyNow.slice(0, 2).join(" / ")}`);
      }
      if (item.whyNotNow.length > 0) {
        lines.push(`- なぜまだ待つのか: ${item.whyNotNow.slice(0, 2).join(" / ")}`);
      }
      if (item.sellerPressureSummary) {
        const sps = item.sellerPressureSummary;
        lines.push(`- 売り圧: ${sps.sellerName ?? sps.sellerType} / ${sps.remainingOverhang}`);
      }
      if (item.themeCompanyFitSummary) {
        const fit = item.themeCompanyFitSummary;
        lines.push(`- テーマ適合: ${fit.themeLabel} / ${fit.selectedCompanyFit}`);
        if (fit.betterCompanyCodes.length > 0) {
          lines.push(`- 比較候補: ${fit.betterCompanyCodes.join(" / ")}`);
        }
      }
      if (item.nextCheck.length > 0) {
        lines.push("- 次に確認すること:");
        for (const r of item.nextCheck) lines.push(`  - ${r}`);
      }
      if (item.listingInfo) {
        const info = item.listingInfo;
        const datesParts: string[] = [];
        if (info.listedAt) datesParts.push(`上場日: ${info.listedAt}`);
        if (info.plannedListingAt) datesParts.push(`上場予定: ${info.plannedListingAt}`);
        if (info.lockupExpiryAt) datesParts.push(`ロックアップ解除: ${info.lockupExpiryAt}`);
        if (info.firstEarningsAt) datesParts.push(`初回決算: ${info.firstEarningsAt}`);
        if (datesParts.length > 0) lines.push(`- listingInfo: ${datesParts.join(" / ")}`);
      }
      lines.push("");
    }
  }

  // patterns
  lines.push("## patterns", "");
  for (const p of report.patterns) {
    lines.push(`### ${p.label} (${p.id})`);
    lines.push(`- ${p.description}`);
    if (p.whyInteresting.length > 0) {
      lines.push("- なぜチャンスっぽいか:");
      for (const r of p.whyInteresting) lines.push(`  - ${r}`);
    }
    if (p.whyDangerous.length > 0) {
      lines.push("- 危険性:");
      for (const r of p.whyDangerous) lines.push(`  - ${r}`);
    }
    if (p.evidenceNeeded.length > 0) {
      lines.push("- 確認すべき証拠:");
      for (const r of p.evidenceNeeded) lines.push(`  - ${r}`);
    }
    lines.push("");
  }

  // candidates 全件
  lines.push("## candidates (全件)", "");
  lines.push("| code | name | finalLabel | chance | watchPhase | parent/sponsor | sellPress | lockup | debt | capex | cycle | dilut | sample | notice |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---:|---|");
  for (const c of report.candidates) {
    const stats = c.outcomeStats;
    const sample = stats ? `${stats.sampleSize}${stats.sampleTooSmall ? " ⚠小" : ""}` : "-";
    const notice = c.notificationEligible
      ? "通知候補"
      : stats?.sampleTooSmall
      ? "[参考値]"
      : "";
    lines.push(`| ${c.code} | ${c.name} | ${c.finalLabel} | ${c.chanceLevel} | ${c.watchPhase} | ${c.parentOrSponsor ?? "-"} | ${c.sellerPressure} | ${c.lockupRisk} | ${c.debtRisk} | ${c.capexRisk} | ${c.cycleRisk} | ${c.dilutionRisk} | ${sample} | ${notice} |`);
  }
  lines.push("");

  // themeCompanyFitReview 詳細
  lines.push("## テーマと銘柄の適合レビュー (themeCompanyFitReview)", "");
  for (const c of report.candidates) {
    const fit = c.themeCompanyFitReview;
    if (!fit.themeLabel) continue;
    lines.push(`### ${c.code} ${c.name}`);
    lines.push(`- テーマ: ${fit.themeLabel}`);
    lines.push(`- テーマ判定: ${fit.themeWasRight}`);
    lines.push(`- 銘柄適合: ${fit.selectedCompanyFit}`);
    if (fit.fitSummary) lines.push(`- 要約: ${fit.fitSummary}`);
    if (fit.whyThemeMayBeRight.length > 0) {
      lines.push("- テーマが当たりそうな理由:");
      for (const r of fit.whyThemeMayBeRight) lines.push(`  - ${r}`);
    }
    if (fit.whyCompanyMayBeWrong.length > 0) {
      lines.push("- 銘柄が違うかもしれない理由:");
      for (const r of fit.whyCompanyMayBeWrong) lines.push(`  - ${r}`);
    }
    if (fit.betterCompanyCandidates.length > 0) {
      lines.push("- 比較候補:");
      for (const b of fit.betterCompanyCandidates) {
        lines.push(`  - ${b.code} ${b.name}: ${b.reason} [${b.relation}]`);
      }
    }
    if (fit.evidenceNeeded.length > 0) {
      lines.push("- 確認する証拠:");
      for (const r of fit.evidenceNeeded) lines.push(`  - ${r}`);
    }
    lines.push("");
  }

  // sellerPressureProfile 詳細
  lines.push("## 売り手プロファイル (sellerPressureProfile)", "");
  for (const c of report.candidates) {
    const spp = c.sellerPressureProfile;
    if (spp.sellerType === "none") continue;
    lines.push(`### ${c.code} ${c.name}`);
    lines.push(`- 種類: ${spp.sellerType}`);
    lines.push(`- 名前: ${spp.sellerName ?? "不明"}`);
    lines.push(`- 目的: ${spp.sellerMotivation}`);
    lines.push(`- 残売り圧: ${spp.remainingOverhang}`);
    if (spp.estimatedClearedAt) lines.push(`- 通過目安: ${spp.estimatedClearedAt}`);
    if (spp.whyItMatters.length > 0) {
      lines.push("- 重要な理由:");
      for (const r of spp.whyItMatters) lines.push(`  - ${r}`);
    }
    if (spp.evidenceNeeded.length > 0) {
      lines.push("- 確認する証拠:");
      for (const r of spp.evidenceNeeded) lines.push(`  - ${r}`);
    }
    lines.push("");
  }

  // outcomeStats 詳細
  lines.push("## outcome stats (per candidate)", "");
  lines.push("> sampleTooSmall=true の行は参考値です。強い判断の根拠にしないでください。", "");
  lines.push("| code | name | sample | hitRate | avgReturn1w | avgReturn1m | avgTopixRel1m |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const c of report.candidates) {
    const s = c.outcomeStats;
    if (!s) continue;
    lines.push(`| ${c.code} | ${c.name} | ${s.sampleSize}${s.sampleTooSmall ? " ⚠小" : ""} | ${s.hitRate == null ? "N/A" : `${Math.round(s.hitRate * 100)}%`} | ${fmtPct(s.avgReturn1w)} | ${fmtPct(s.avgReturn1m)} | ${fmtPct(s.avgTopixRelative1m)} |`);
  }
  lines.push("");

  // reference events
  if (report.referenceEvents.length > 0) {
    lines.push("## reference events (未上場・テーマ参照)", "");
    lines.push("> 公式/報道/噂を必ず分けます。報道・噂は強い判断に使いません。", "");
    for (const ev of report.referenceEvents) {
      lines.push(`### ${ev.eventName} (${ev.eventType}) [${ev.confidence}]`);
      lines.push(`- company: ${ev.companyName}`);
      if (ev.plannedDate) lines.push(`- plannedDate: ${ev.plannedDate}`);
      if (ev.actualDate) lines.push(`- actualDate: ${ev.actualDate}`);
      if (ev.source) lines.push(`- source: ${ev.source}`);
      if (ev.sourceCheckedAt) lines.push(`- sourceCheckedAt: ${ev.sourceCheckedAt}`);
      if ((ev.relatedThemes ?? []).length > 0) lines.push(`- relatedThemes: ${(ev.relatedThemes ?? []).join(", ")}`);
      if ((ev.relatedJapaneseCompanies ?? []).length > 0) lines.push(`- relatedJapaneseCompanies: ${(ev.relatedJapaneseCompanies ?? []).join(", ")}`);
      lines.push("");
    }
  }

  // 通知文サンプル
  lines.push("## 通知サンプル (notificationEligible=true のみ)", "");
  const notifiable = report.candidates.filter(c => c.notificationEligible);
  if (notifiable.length === 0) {
    lines.push("- 現時点で通知資格を満たす候補はありません（証拠不足/サンプル不足/リスク表示不足など）");
  } else {
    for (const c of notifiable) {
      lines.push("```");
      lines.push(`【${c.finalLabel}】${c.code} ${c.name}`);
      lines.push(`理由: ${c.reasonSummary}`);
      if (c.whyNow.length > 0) lines.push(`今見る理由: ${c.whyNow.slice(0, 2).join(" / ")}`);
      if (c.whyNotNow.length > 0) lines.push(`まだ待つ理由: ${c.whyNotNow.slice(0, 2).join(" / ")}`);
      const spp = c.sellerPressureProfile;
      if (spp.sellerType !== "none" && spp.remainingOverhang !== "unknown") {
        lines.push(`売り圧: ${spp.sellerName ?? spp.sellerType} / ${spp.remainingOverhang}`);
      }
      if (c.whyDangerous.length > 0) lines.push(`注意: ${c.whyDangerous.slice(0, 3).join(" / ")}`);
      if (c.waitFor.length > 0) lines.push(`次に確認: ${c.waitFor.slice(0, 4).join(" / ")}`);
      lines.push("※売買推奨ではありません。");
      lines.push("```");
      lines.push("");
    }
  }

  // 特殊状況ウォッチ 成績表
  lines.push("## 特殊状況ウォッチ 成績表 (outcomeStats)", "");
  lines.push("> sampleTooSmall=true はサンプル不足。参考値のみ・強い判断に使わない。", "");
  lines.push("| groupType | groupKey | sample | hitRate | avgReturn1w | avgReturn1m | avgTopixRel1m | note |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---|");
  for (const row of report.outcomeStats) {
    const sampleStr = `${row.sampleSize}${row.sampleTooSmall ? " ⚠小" : ""}`;
    const hitStr = row.hitRate == null ? "N/A" : `${Math.round(row.hitRate * 100)}%`;
    lines.push(`| ${row.groupType} | ${row.groupKey} | ${sampleStr} | ${hitStr} | ${fmtPct(row.avgReturn1w)} | ${fmtPct(row.avgReturn1m)} | ${fmtPct(row.avgTopixRelative1m)} | ${row.note} |`);
  }
  lines.push("");
  lines.push("## rule", "- 安い株探しではない", "- 単価が安い = 割安ではない", "- 調査候補は売買推奨ではない", "- sampleTooSmall は強い判断の根拠にしない", "- 公式・報道・噂を必ず分ける");
  lines.push("", `*alpha-pon special situation watch | ${report.generatedAt} | ※売買推奨ではありません*`);
  return lines.join("\n");
}

// ─────────── main ───────────

function main() {
  const config = readYaml<SpecialSituationConfig>("config/special-situation-watch-rules.yml");
  const report = buildReport(config);
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    join("reports", "special_situation_watch_latest.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );
  writeFileSync(
    join("reports", "special_situation_watch_latest.md"),
    renderMarkdown(report),
    "utf-8"
  );
  console.log(
    `special situation watch generated: ${report.patterns.length} patterns, ${report.candidates.length} candidates, ${report.topChanceList.length} top chances, ${report.referenceEvents.length} reference events`
  );
}

main();
