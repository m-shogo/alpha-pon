export const SHOCK_SCORE_KEYS = [
  "businessImpactContainment",
  "accountingIntegrity",
  "actorSeparability",
  "organizationalContainment",
  "regulatoryContainment",
  "brandResilience",
  "managementContinuity",
  "fundamentalResilience",
  "discountMagnitude",
  "priceStabilization",
] as const;

export type ShockScoreKey = typeof SHOCK_SCORE_KEYS[number];
export type ShockDimensionScores = Record<ShockScoreKey, 0 | 1 | 2>;

export type ShockActorType =
  | "founder"
  | "ceo"
  | "executive"
  | "employee"
  | "customer"
  | "organization"
  | "unknown";

export type ShockEvidenceStatus = "confirmed" | "reported" | "rumor" | "unknown";
export type ShockInvestigationStatus = "open" | "substantially_complete" | "closed" | "not_applicable" | "unknown";
export type ShockPriceState =
  | "falling"
  | "volatile"
  | "stabilizing"
  | "stabilized_after_drop"
  | "rebounded_too_fast"
  | "unknown";

export type ShockLabel = "research_priority" | "watch" | "caution" | "avoid";

export type ShockSource = {
  title: string;
  url: string;
  sourceType: "company" | "regulator" | "exchange" | "major_media" | "other";
  publishedAt?: string | null;
};

export type HistoricalShockOutcome = {
  summary: string;
  recoveryPattern: "fast" | "gradual" | "mixed" | "failed" | "unknown";
  notes?: string[];
};

export type HistoricalShockCase = {
  id: string;
  company: string;
  ticker?: string | null;
  country: string;
  eventDate: string;
  decisionCheckpoint: string;
  category: string;
  actorType: ShockActorType;
  eventSummary: string;
  macroPrimaryCause: boolean;
  evidenceStatus: ShockEvidenceStatus;
  priceStateAtCheckpoint: ShockPriceState;
  scores: ShockDimensionScores;
  score: number;
  label: ShockLabel;
  scoringNotes: Partial<Record<ShockScoreKey, string>>;
  sources: ShockSource[];
  outcome?: HistoricalShockOutcome;
  researchConfidence: "high" | "medium" | "low";
  tags?: string[];
};

export type ShockCandidate = {
  id: string;
  code?: string | null;
  company: string;
  detectedAt: string;
  category: string;
  actorType: ShockActorType;
  eventSummary: string;
  macroPrimaryCause: boolean;
  evidenceStatus: ShockEvidenceStatus;
  investigationStatus?: ShockInvestigationStatus;
  priceState: ShockPriceState;
  scores: ShockDimensionScores;
  criticalLicenseOrDelistingRisk?: boolean;
  sources?: ShockSource[];
};

export type ShockNotificationDecision = {
  eligible: boolean;
  score: number;
  label: ShockLabel;
  blockers: string[];
};

export function validateDimensionScores(scores: ShockDimensionScores): void {
  for (const key of SHOCK_SCORE_KEYS) {
    const value = scores[key];
    if (value !== 0 && value !== 1 && value !== 2) {
      throw new Error(`invalid shock score ${key}=${String(value)}; expected 0|1|2`);
    }
  }
}

export function totalShockScore(scores: ShockDimensionScores): number {
  validateDimensionScores(scores);
  return SHOCK_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0);
}

export function labelShockScore(score: number): ShockLabel {
  if (score >= 16) return "research_priority";
  if (score >= 12) return "watch";
  if (score >= 8) return "caution";
  return "avoid";
}

export function buildNotificationDecision(
  candidate: ShockCandidate,
  threshold = 12
): ShockNotificationDecision {
  const score = totalShockScore(candidate.scores);
  const blockers: string[] = [];
  const investigationStatus = candidate.investigationStatus ?? "unknown";

  if (score < threshold) blockers.push(`score ${score} < threshold ${threshold}`);
  if (candidate.evidenceStatus !== "confirmed") blockers.push("evidence is not confirmed");
  if (investigationStatus === "open" || investigationStatus === "unknown") {
    blockers.push(`investigationStatus=${investigationStatus}`);
  }
  if (candidate.macroPrimaryCause) blockers.push("macro factor is primary cause");
  if (candidate.priceState !== "stabilized_after_drop") blockers.push(`priceState=${candidate.priceState}`);
  if (candidate.scores.accountingIntegrity === 0) blockers.push("accountingIntegrity=0");
  if (candidate.criticalLicenseOrDelistingRisk) blockers.push("critical license/delisting risk unresolved");
  if (!candidate.sources?.some(source => source.sourceType === "company" || source.sourceType === "regulator" || source.sourceType === "exchange")) {
    const majorMediaCount = candidate.sources?.filter(source => source.sourceType === "major_media").length ?? 0;
    if (majorMediaCount < 2) blockers.push("primary evidence or multiple major-media sources required");
  }

  return {
    eligible: blockers.length === 0,
    score,
    label: labelShockScore(score),
    blockers,
  };
}

export function assertHistoricalCaseIntegrity(item: HistoricalShockCase): void {
  const calculated = totalShockScore(item.scores);
  if (calculated !== item.score) {
    throw new Error(`${item.id}: score mismatch expected=${calculated} actual=${item.score}`);
  }
  const label = labelShockScore(item.score);
  if (label !== item.label) {
    throw new Error(`${item.id}: label mismatch expected=${label} actual=${item.label}`);
  }
  if (item.decisionCheckpoint < item.eventDate) {
    throw new Error(`${item.id}: decisionCheckpoint must not precede eventDate`);
  }
  if (item.sources.length === 0) throw new Error(`${item.id}: at least one source is required`);
}

export function isMacroDriven(text: string, macroKeywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return macroKeywords.some(keyword => normalized.includes(keyword.toLowerCase()));
}

function categoricalPenalty(a: HistoricalShockCase | ShockCandidate, b: HistoricalShockCase): number {
  let penalty = 0;
  if (a.category !== b.category) penalty += 4;
  if (a.actorType !== b.actorType) penalty += 2;
  if (a.macroPrimaryCause !== b.macroPrimaryCause) penalty += 5;
  return penalty;
}

export function analogyDistance(
  candidate: ShockCandidate | HistoricalShockCase,
  historical: HistoricalShockCase
): number {
  let distance = categoricalPenalty(candidate, historical);
  for (const key of SHOCK_SCORE_KEYS) {
    const weight = key === "accountingIntegrity" || key === "organizationalContainment" ? 2 : 1;
    distance += Math.abs(candidate.scores[key] - historical.scores[key]) * weight;
  }
  return distance;
}

export function findClosestHistoricalCases(
  candidate: ShockCandidate,
  historicalCases: HistoricalShockCase[],
  limit = 3
): Array<{ item: HistoricalShockCase; distance: number }> {
  const confidencePenalty = (item: HistoricalShockCase): number => {
    if (item.researchConfidence === "high") return 0;
    if (item.researchConfidence === "medium") return 1;
    return 3;
  };
  return historicalCases
    .filter(item => !item.macroPrimaryCause && item.id !== candidate.id)
    .map(item => ({ item, distance: analogyDistance(candidate, item) + confidencePenalty(item) }))
    .sort((a, b) => a.distance - b.distance || b.item.score - a.item.score)
    .slice(0, Math.max(0, limit));
}

export type PriceObservation = {
  date: string;
  close: number;
  volume?: number | null;
};

function pct(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

/**
 * Conservative stabilization detector. It intentionally prefers "wait" over
 * declaring a bottom. Five sessions are only a minimum signal, not proof of a bottom.
 */
export function inferPriceState(observations: PriceObservation[]): ShockPriceState {
  const rows = [...observations]
    .filter(row => Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 5) return "unknown";

  const recent = rows.slice(-5);
  const latest = recent.at(-1)!;
  const previousFour = recent.slice(0, -1);
  const priorLow = Math.min(...previousFour.map(row => row.close));
  const fiveDayChange = pct(recent[0].close, latest.close);
  const recentLow = Math.min(...recent.map(row => row.close));
  const latestVsLow = pct(recentLow, latest.close);
  const lowIndex = recent.findIndex(row => row.close === recentLow);

  if (latest.close < priorLow && fiveDayChange < -3) return "falling";
  if (fiveDayChange >= 12 || latestVsLow >= 15) return "rebounded_too_fast";

  const dayChanges = recent.slice(1).map((row, index) => Math.abs(pct(recent[index].close, row.close)));
  const maxDailyMove = Math.max(...dayChanges);
  if (maxDailyMove >= 7) return "volatile";

  // 安値が直近2日ではなく、そこから3営業日程度は新安値を付けず、
  // かつ急反発でもない場合だけ「下落一巡候補」にする。
  const lowOccurredEarlyEnough = lowIndex >= 0 && lowIndex <= 1;
  if (lowOccurredEarlyEnough && fiveDayChange >= -3 && fiveDayChange <= 8 && latestVsLow <= 10) {
    return "stabilized_after_drop";
  }
  return "stabilizing";
}

export function formatShockCandidateSummary(
  candidate: ShockCandidate,
  analogues: Array<{ item: HistoricalShockCase; distance: number }>
): string {
  const decision = buildNotificationDecision(candidate);
  const analogyText = analogues
    .map(({ item, distance }) => `${item.company}(${item.eventDate}, 距離${distance}, ${item.score}/20)`)
    .join(" / ");
  return [
    `${candidate.company} ${decision.score}/20 [${decision.label}]`,
    `分類: ${candidate.category} / actor=${candidate.actorType}`,
    `株価状態: ${candidate.priceState} / evidence=${candidate.evidenceStatus} / investigation=${candidate.investigationStatus ?? "unknown"}`,
    `類似: ${analogyText || "なし"}`,
    decision.eligible ? "通知ゲート: PASS（調査候補）" : `通知ゲート: WAIT (${decision.blockers.join("; ")})`,
    "※売買推奨ではありません",
  ].join("\n");
}
