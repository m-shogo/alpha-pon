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
};

export type AlertHistory = {
  code: string;
  lastNotifiedAt: string;
  lastScore: number;
  lastReasons: string[];
};

// --- スコアリング入力型 ---

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

// --- 設定ファイル型 ---

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
