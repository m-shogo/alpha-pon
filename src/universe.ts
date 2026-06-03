// ユニバース候補・仮説・検証の型定義
// 注意: 買い推奨ではない。監視・検証・反省用。

import type { MissReason } from "./pro-types.js";

export type UniverseScreeningStatus = "monitoring" | "escalated" | "dismissed";

export type DisclosureStatus =
  | "confirmed_positive"
  | "confirmed_negative"
  | "confirmed_neutral"
  | "official_check_required"
  | "missing";

export type DisclosureSourceType = "tdnet" | "company_ir" | "edinet" | "manual" | "missing";

export type DisclosureEvidence = {
  status: DisclosureStatus;
  sourceType: DisclosureSourceType;
  sourceUrl: string | null;
  publishedAt: string | null;
  title: string | null;
  summary: string | null;
};

export type UniverseCandidate = {
  code: string;
  name: string;
  sector: string | null;
  detectedAt: string;
  currentPrice: number | null;
  high52w: number | null;
  drawdownPct: number | null;
  change5dPct?: number | null;
  change20dPct?: number | null;
  topixChange5dPct?: number | null;
  topixChange20dPct?: number | null;
  relativeTopix5dPct?: number | null;
  relativeTopix20dPct?: number | null;
  volumeSpikeRatio?: number | null;
  priceSignalSource?: "jquants" | "external" | "company_memory" | "missing";
  priceSignalQuality?: "exact" | "fallback" | "stale" | "missing";
  priceRiskWarnings?: Array<{ level: "info" | "warning" | "block"; reason: string; evidence: string[] }>;
  operatingProfitYoY: number | null;
  hasDownwardRevision: boolean;
  hasNegativeFlag: boolean;
  hasRecentDisclosure: boolean;
  disclosureEvidence?: DisclosureEvidence;
  matchedWorldEventTags: string[];
  screeningScore: number;
  warnings: string[];
  status: UniverseScreeningStatus;
  dataSource: "jquants" | "mock";
};

export type HypothesisTimeframe = "1w" | "1m" | "3m";
export type HypothesisDirection = "up" | "down" | "sideways" | "unknown";
export type HypothesisStatus = "open" | "closed";
export type HypothesisResult = "hit" | "miss" | "too_early" | "invalidated" | "unknown";
export type HypothesisLabel = "監視候補" | "検証候補" | "反証待ち";

export type StockCandidateHypothesis = {
  schemaVersion: 1;
  code: string;
  name: string;
  detectedAt: string;
  reviewDueAt: string;
  reason: string;
  expectedTimeframe: HypothesisTimeframe;
  expectedDirection: HypothesisDirection;
  confidence: number;
  invalidationSignals: string[];
  evidenceNeeded: string[];
  relatedWorldEventIds: string[];
  relatedDisclosureIds: string[];
  status: HypothesisStatus;
  label: HypothesisLabel;
};

export type HypothesisActionLabel = "watch" | "log" | "ignore";
export type ReviewHorizon = "1d" | "1w" | "1m" | "3m";

export type HypothesisOutcome = {
  schemaVersion: 1;
  code: string;
  name: string;
  hypothesis: StockCandidateHypothesis;
  evaluatedAt: string;
  reviewHorizon: ReviewHorizon;
  actionLabel: HypothesisActionLabel;
  scoreAtPrediction: number | null;
  startPrice: number | null;
  endPrice1d: number | null;
  endPrice1w: number | null;
  endPrice1m: number | null;
  endPrice3m: number | null;
  return1d: number | null;
  return1w: number | null;
  return1m: number | null;
  return3m: number | null;
  topixReturn1d: number | null;
  benchmarkReturn1w: number | null;
  benchmarkReturn3m: number | null;
  topixReturn1m: number | null;
  relativeToTopix1d: number | null;
  relativeToTopix1w: number | null;
  relativeToTopix1m: number | null;
  relativeToTopix3m: number | null;
  maxDrawdownPct: number | null;
  actualDirection: "up" | "down" | "sideways" | "unknown";
  result: HypothesisResult;
  dataAvailability: "ok" | "partial" | "missing";
  whatMatched: string[];
  whatDiffered: string[];
  missedSignals: string[];
  improvedRuleIdeas: string[];
  missReasonCandidates?: MissReason[];
  notes: string;
  dataSource: "jquants" | "mock";
};

export type ActionLabelStats = { total: number; avgExcessReturn1w: number | null; avgExcessReturn1m: number | null };
export type ScoreBand = "0-49" | "50-69" | "70-84" | "85-100" | "unknown";
export type ScoreBandStats = { total: number; hitRate: number | null; avgExcessReturn1w: number | null; avgExcessReturn1m: number | null };

export type AccuracySummary = {
  total: number;
  hit: number;
  miss: number;
  tooEarly: number;
  unknown: number;
  hitRate: number | null;
  avgReturn1m: number | null;
  avgTopixReturn1m: number | null;
  avgRelativeToTopix1m: number | null;
  avgMaxDrawdownPct: number | null;
  byActionLabel: Record<HypothesisActionLabel, ActionLabelStats>;
  byScoreBand: Record<ScoreBand, ScoreBandStats>;
};

export type WorldContextRegime = { id: string; level: string; why: string; watchCategories: string[]; caution: string[] };
export type WorldContext = { asOf: string; mode: string; summary: string; activeRegimes: WorldContextRegime[]; operatingRules: string[] };

export const SCREENING_CRITERIA = {
  drawdownMin: -35,
  drawdownMax: -15,
  operatingProfitYoYMin: 0,
} as const;

export const HYPOTHESIS_LABEL_DESCRIPTIONS: Record<HypothesisLabel, string> = {
  "監視候補": "条件が一部揃っている。引き続き観察する段階。",
  "検証候補": "複数の条件が揃い、仮説を立てて追跡する段階。",
  "反証待ち": "仮説は立てた。反証シグナルが出るまで保留。",
};
