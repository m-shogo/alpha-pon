export type CandidateStatus =
  | "candidate"
  | "research"
  | "watch"
  | "active"
  | "ignore"
  | "expired";

export type Priority = "S" | "A" | "B" | "C";
export type Market = "TSE" | "NYSE" | "NASDAQ";
export type AlertLevel = "urgent" | "daily" | "log" | "ignore";
export type DataQuality = "ok" | "partial" | "missing";
export type RiskDecision = "reject" | "research_only" | "watch" | "high_quality_candidate";
export type ExpertVerdict = "block" | "caution" | "pass" | "strong";
export type ExpertLensKey =
  | "quality_value"
  | "growth_compounder"
  | "quant_evidence"
  | "risk_manager"
  | "event_specialist"
  | "ipo_supply"
  | "trend_contrarian"
  | "data_engineer"
  | "macro_cycle"
  | "global_risk"
  | "regulation"
  | "technology_cycle"
  | "supply_chain"
  | "behavioral_sentiment"
  | "cross_domain_synthesizer";

export type Candidate = {
  code: string;
  name: string;
  market: Market;
  status: CandidateStatus;
  priority: Priority;
  tags: string[];
  rules: string[];
  listedAt?: string;
};

export type ScoreBreakdown = {
  structuralEvent: number;
  supplyDemand: number;
  valuation: number;
  theme: number;
  businessSafety: number;
  aiReview: number;
};

export type MarketContext = {
  code: string;
  date: string;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  topixReturn20d: number | null;
  relativeToTopix20d: number | null;
  liquidityYen20d: number | null;
  volatility20d: number | null;
  warnings: string[];
};

export type FinancialQuality = {
  revenueYoY: number | null;
  operatingProfitYoY: number | null;
  operatingMargin: number | null;
  operatingMarginYoY: number | null;
  forecastRevenueProgressRate: number | null;
  forecastOperatingProfitProgressRate: number | null;
  hasDownwardRevision: boolean | null;
  roic: number | null;
  roe: number | null;
  fcf: number | null;
  fcfMargin: number | null;
  netCash: number | null;
  equityRatio: number | null;
  moatScore: number;
  qualityScore: number;
  reasons: string[];
  negativeReasons: string[];
  warnings: string[];
};

export type HypeRisk = {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
  warnings: string[];
};

export type PrimaryDisclosureCategory =
  | "earnings"
  | "upward_revision"
  | "downward_revision"
  | "midterm_plan"
  | "large_order"
  | "buyback"
  | "share_issuance"
  | "scandal"
  | "ma"
  | "restructuring"
  | "dividend"
  | "other";

export type PrimaryDisclosureItem = {
  source: "TDnet" | "EDINET";
  code: string;
  companyName: string;
  title: string;
  publishedAt: string;
  url: string;
  category: PrimaryDisclosureCategory;
  severity: "positive" | "neutral" | "caution" | "blocker";
  reasons: string[];
};

export type PrimaryDisclosureReview = {
  sourceCoverage: {
    tdnetCount: number;
    edinetCount: number;
    hasPrimarySource: boolean;
  };
  decision: "confirmed" | "caution" | "block" | "missing";
  items: PrimaryDisclosureItem[];
  positives: string[];
  warnings: string[];
  blockers: string[];
  evidenceNeeded: string[];
};

export type RiskReview = {
  decision: RiskDecision;
  blockers: string[];
  warnings: string[];
  strengths: string[];
  checklist: {
    circleOfCompetence: boolean;
    businessQuality: boolean;
    financialSafety: boolean;
    marketRelativeStrength: boolean;
    liquidityOk: boolean;
    volatilityOk: boolean;
    noDownwardRevision: boolean;
    noFomo: boolean;
    enoughData: boolean;
  };
};

export type ExpertLensResult = {
  key: ExpertLensKey;
  name: string;
  verdict: ExpertVerdict;
  confidence: number;
  reasons: string[];
  objections: string[];
  nextChecks: string[];
};

export type ExpertEnsembleReview = {
  finalVerdict: ExpertVerdict;
  consensusScore: number;
  passCount: number;
  cautionCount: number;
  blockCount: number;
  strongCount: number;
  lenses: ExpertLensResult[];
  disagreements: string[];
  requiredBeforeNotification: string[];
};

export type HypothesisCluster = {
  id: string;
  label: string;
  matchedTags: string[];
  thesis: string;
  mechanisms: string[];
  possibleBeneficiaries: string[];
  risks: string[];
  counterSignals: string[];
  primaryChecks: string[];
};

export type HypothesisMap = {
  summary: string;
  clusters: HypothesisCluster[];
  crossLinks: string[];
  falsificationTriggers: string[];
  watchQuestions: string[];
  sourceNeeds: string[];
  confidence: number;
};

export type ScoreResult = {
  candidate: Candidate;
  breakdown: ScoreBreakdown;
  score: number;
  alertLevel: AlertLevel;
  reasons: string[];
  negativeReasons: string[];
  nextSteps: string[];
  dataQuality: DataQuality;
  warnings: string[];
  createdAt: string;
  marketContext?: MarketContext;
  financialQuality?: FinancialQuality;
  hypeRisk?: HypeRisk;
  primaryDisclosureReview?: PrimaryDisclosureReview;
  riskReview?: RiskReview;
  expertReview?: ExpertEnsembleReview;
  hypothesisMap?: HypothesisMap;
};

export type AlertHistory = {
  code: string;
  lastNotifiedAt: string;
  lastScore: number;
  lastReasons: string[];
};

export type IpoPressureInput = {
  daysSinceListing: number;
  volumeRatioToFirstDay: number;
  noNewLowDays: number;
  recoveredMa20: boolean;
  lockupPassed: boolean;
};

export type EarningsDropInput = {
  nextDayChangePct: number | null;
  hasDownwardRevision: boolean | null;
  revenueYoY: number | null;
  operatingProfitYoY: number | null;
  hasStrategicTheme: boolean;
};

export type PullbackInput = {
  drawdownPct: number;
  revenueYoY: number | null;
  operatingProfitYoY: number | null;
  hasDownwardRevision: boolean | null;
  hasStrategicTheme: boolean;
};

export type WatchlistConfig = {
  symbols: Candidate[];
};

export type RulesConfig = {
  scoring: {
    alertThresholds: {
      urgent: number;
      daily: number;
      log: number;
    };
    maxScores: ScoreBreakdown;
  };
  alertSuppression: {
    sameCandidateDays: number;
    scoreImprovementThreshold: number;
  };
};

export type ThemeEntry = {
  label: string;
  score: number;
};

export type ThemesConfig = {
  themes: Record<string, ThemeEntry>;
};
