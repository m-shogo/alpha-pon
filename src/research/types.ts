// Research OS — 型定義。research/schemas/*.schema.json と 1:1 で対応させる。
// スキーマを変えたらここも変える（tests/research/schema-sync.test.ts が両者の整合を検査する）。

export type EdgeStatus = "idea" | "research" | "shadow" | "production" | "rejected" | "deprecated";
export type EdgePriority = "S" | "A" | "B" | "C";
export type GateState = "pass" | "fail" | "unknown";

export type SourceType =
  | "company_ir"
  | "tdnet"
  | "jpx"
  | "edinet"
  | "financial_statement"
  | "regulator"
  | "ministry"
  | "court"
  | "administrative"
  | "major_media"
  | "market_data"
  | "historical_db"
  | "academic";

export interface EdgeEvidence {
  source: string;
  sourceType: SourceType;
  /** その情報が公に入手可能になった時刻。PIT の基準。 */
  observedAt: string;
  eventDate?: string;
  summary: string;
}

export interface GateItem {
  state: GateState;
  evidence?: string;
  checkedAt?: string;
}

/** Production Gate の 11 項目。順序は仕様書 §5 と一致させる。 */
export const GATE_KEYS = [
  "sufficientSamples",
  "holdoutPass",
  "pitSafe",
  "netAlphaPositive",
  "executionFeasible",
  "liquiditySufficient",
  "borrowCostCovered",
  "confoundersRemoved",
  "counterfactualExplained",
  "decayChecked",
  "falseDiscoveryGuard",
] as const;

export type GateKey = (typeof GATE_KEYS)[number];

export type PromotionGate = Record<GateKey, GateItem>;

export interface DateWindow {
  from: string;
  to: string;
}

export interface Edge {
  schemaVersion: 1;
  id: string;
  title: string;
  status: EdgeStatus;
  priority: EdgePriority;
  owner: string;
  createdAt: string;
  lastUpdate: string;
  hypothesis: string;
  mechanism: string;
  confidence: number;
  requiredData: string[];
  evidence?: EdgeEvidence[];
  analogIds?: string[];
  entry: { trigger: string; side: "long" | "short" | "pair" | "undecided"; decisionLagMinutes?: number };
  exit: { rule: string; holdingPeriodDays?: number; invalidation?: string };
  execution?: {
    feasibility?: "unknown" | "blocked" | "hard" | "feasible";
    notes?: string;
    borrowAvailability?: "unknown" | "none" | "scarce" | "available";
    adtvJpy?: number;
  };
  voiInputs: {
    expectedNetAlphaBps: number;
    uncertaintyReduction: number;
    executionImprovement?: number;
    researchCost: number;
    notes?: string;
  };
  samples: { required: number; current: number; requiredAnalogs: number };
  promotionGate: PromotionGate;
  decay: { reviewIntervalDays: number; lastCheckedAt?: string; score?: number; notes?: string };
  holdout?: { researchWindow?: DateWindow; holdoutWindow?: DateWindow };
  rejection?: { reason: string; rejectedAt: string; disconfirmingEvidence?: string[] };
  notes?: string;
}

export interface HistoricalAnalog {
  schemaVersion: 1;
  id: string;
  eventType: string;
  companyCode: string;
  companyName: string;
  eventDate: string;
  observedAt: string;
  source: string;
  sourceType: SourceType;
  summary: string;
  recordedAt: string;
  edgeIds?: string[];
  marketReaction?: {
    measuredAt: string;
    horizonDays: number;
    rawReturnBps: number;
    benchmarkReturnBps?: number;
    excessReturnBps?: number;
    benchmark?: string;
    priceSource?: string;
  };
  outcome?: {
    measuredAt: string;
    verdict: "repriced_up" | "repriced_down" | "no_move" | "unresolved";
    roiBps?: number;
    notes?: string;
  };
  keyEvents?: Array<{ date: string; label: string; source?: string }>;
  dataGaps?: string[];
}

export interface Counterfactual {
  schemaVersion: 1;
  id: string;
  analogId: string;
  edgeId?: string;
  method:
    | "peer_matched"
    | "sector_index"
    | "market_index"
    | "pre_event_trend"
    | "synthetic_control"
    | "same_company_prior_period";
  comparator: string;
  observedAt: string;
  recordedAt: string;
  eventReturnBps?: number;
  counterfactualReturnBps?: number;
  differenceBps?: number;
  explanation?: string;
  dataGaps?: string[];
}

export interface Confounder {
  schemaVersion: 1;
  id: string;
  analogId?: string;
  edgeId?: string;
  category: string;
  date: string;
  description: string;
  handling: "excluded_sample" | "adjusted" | "controlled_by_counterfactual" | "acknowledged_unresolved";
  impactEstimateBps?: number;
  source?: string;
  recordedAt: string;
}

export interface ResearchLogEntry {
  schemaVersion: 1;
  id: string;
  at: string;
  actor: string;
  type:
    | "research"
    | "edge_created"
    | "edge_updated"
    | "edge_rejected"
    | "edge_promoted"
    | "analog_added"
    | "counterfactual_added"
    | "confounder_added"
    | "backtest_run"
    | "decay_check"
    | "data_gap"
    | "os_change";
  edgeId?: string;
  queueRank?: number;
  queueOverrideReason?: string;
  summary: string;
  findings?: string[];
  addedAnalogIds?: string[];
  rejectionReason?: string;
  dataGaps?: string[];
  nextActions?: string[];
  sources?: string[];
}

export interface Checkpoint {
  schemaVersion: 1;
  sequence: number;
  savedAt: string;
  actor: string;
  researchedEdgeId?: string;
  researchDone: string;
  addedAnalogIds: string[];
  rejections: Array<{ target: string; reason: string }>;
  dataGaps: string[];
  nextCandidates: Array<{ edgeId: string; why: string }>;
  openQuestions?: string[];
  osIssues?: string[];
}

/** Research OS のスナップショット。Queue / Dashboard / Gate 判定はすべてこれを入力にする。 */
export interface ResearchState {
  edges: Edge[];
  analogs: HistoricalAnalog[];
  counterfactuals: Counterfactual[];
  confounders: Confounder[];
  checkpoint: Checkpoint | null;
}
