import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { addDaysJst, todayJst } from "./date.js";
import type { WorldEventReflection } from "./analysis/world-event-reflection.js";

export type WorldImpactSourceQuality = "official" | "tier1" | "tier2" | "unknown";
export type WorldImpactDataAvailability = "ok" | "partial" | "missing" | "priceDataPending";
export type WorldImpactResult = "hit" | "miss" | "inverse" | "too_early" | "unclear" | "insufficient_data" | "unknown" | null;
export type WorldImpactDirection = "up" | "down" | "sideways" | "mixed" | "unknown";
export type WorldImpactHorizon = "1d" | "1w" | "1m";

// ── v2: 影響メカニズム / 検証可能仮説 / 外れ理由 ──────────────

export const WORLD_IMPACT_MECHANISMS = [
  "demand",
  "supply",
  "cost",
  "fx",
  "rates",
  "regulation",
  "energy",
  "defense",
  "semiconductor",
  "consumer",
  "travel",
  "logistics",
  "ip_brand",
  "geopolitical",
  "climate_disaster",
  "unknown",
] as const;
export type WorldImpactMechanism = (typeof WORLD_IMPACT_MECHANISMS)[number];

export type WorldImpactDirectionCall = "positive" | "negative" | "mixed" | "unclear";
export type WorldImpactReviewStatus = "pending" | "reviewed" | "skipped" | "insufficient_data";

export const WORLD_IMPACT_MISS_REASONS = [
  "already_priced_in",
  "weak_linkage",
  "macro_overpowered",
  "wrong_lag",
  "wrong_direction",
  "company_specific_offset",
  "data_insufficient",
  "unclear",
] as const;
export type WorldImpactMissReason = (typeof WORLD_IMPACT_MISS_REASONS)[number];

export const WORLD_IMPACT_MISS_REASON_LABELS: Record<WorldImpactMissReason, string> = {
  already_priced_in: "織り込み済み",
  weak_linkage: "関連が弱かった",
  macro_overpowered: "地合いに負けた",
  wrong_lag: "時間軸が違った",
  wrong_direction: "方向が逆だった",
  company_specific_offset: "個別要因に打ち消された",
  data_insufficient: "データ不足",
  unclear: "不明",
};

export type WorldImpactPath = {
  event: string;
  mechanisms: WorldImpactMechanism[];
  themes: string[];
  companies: string[];
  note: string;
};

export type WorldEventImpactOutcome = {
  horizon: WorldImpactHorizon;
  dueAt: string;
  result: WorldImpactResult;
  expectedDirection: WorldImpactDirection;
  actualDirection: WorldImpactDirection;
  dataAvailability: WorldImpactDataAvailability;
  returnPct: number | null;
  topixReturnPct: number | null;
  relativeToTopixPct: number | null;
  missReason: WorldImpactMissReason | null;
  missedSignals: string[];
  lesson: string | null;
};

export type WorldEventImpactCompanyLink = {
  companyCode: string;
  companyName: string;
  matchedTags: string[];
  linkReason: string;
};

export type WorldEventImpactReview = {
  schemaVersion: 1 | 2;
  reviewKey: string;
  eventId: string;
  eventDate: string;
  topic: string;
  source: string | null;
  sourceQuality: WorldImpactSourceQuality;
  namedEntities: string[];
  affectedSectors: string[];
  affectedCompanyCodes: string[];
  companyLinks: WorldEventImpactCompanyLink[];
  expectedMechanism: string;
  secondOrderEffect: string;
  counterArgument: string;
  timeLag: string;
  expectedHorizon: WorldImpactHorizon;
  dataAvailability: WorldImpactDataAvailability;
  outcomes: WorldEventImpactOutcome[];
  missedSignals: string[];
  lesson: string | null;
  createdAt: string;
  updatedAt: string;
  // v2: 検証可能仮説フィールド（v1 レコードは normalize/backfill で補完される）
  mechanisms: WorldImpactMechanism[];
  impactPath: WorldImpactPath;
  direction: WorldImpactDirectionCall;
  confidence: number | null;
  expectedLagDays: number | null;
  thesis: string;
  falsification: string;
  watchSignals: string[];
  riskFactors: string[];
  reviewDueAt: string | null;
  reviewStatus: WorldImpactReviewStatus;
};

export type WorldImpactAudit = {
  schemaVersion: 1;
  generatedAt: string;
  healthStatus: "ok" | "needs_attention" | "action_required";
  totalReviews: number;
  pendingReviews: number;
  overdueReviews: number;
  missingCounterArguments: number;
  missingMechanisms: number;
  dataUnavailable: number;
  priceDataPending: number;
  sourceQualityUnknown: number;
  unknownMatchedAsHit: number;
  duplicateKeys: Array<{ key: string; count: number }>;
  // v2 監査項目
  insufficientData: number;
  confidenceMissing: number;
  mechanismUnknown: number;
  falsificationMissing: number;
  jsonlParseErrors: number;
  latestMismatch: number;
  reviewStatusCounts: Record<string, number>;
  outcomeResultCounts: Record<string, number>;
  missReasonCounts: Record<string, number>;
  priorityIssues: Array<{
    severity: "urgent" | "attention" | "info";
    category: string;
    title: string;
    detail: string;
  }>;
};

export type WorldImpactCalibrationRow = {
  groupType: "confidence" | "mechanism" | "lag";
  groupKey: string;
  total: number;
  evaluated: number;
  hit: number;
  miss: number;
  inverse: number;
  hitRate: number | null;
  sampleTooSmall: boolean;
  note: string;
};

export type WorldImpactCalibration = {
  schemaVersion: 1;
  generatedAt: string;
  totalReviews: number;
  evaluatedOutcomes: number;
  rows: WorldImpactCalibrationRow[];
  notes: string[];
};

type CandidateLike = {
  code: string;
  name: string;
  tags?: string[];
  sector?: string | null;
  reasons?: string[];
  negativeReasons?: string[];
  nextToSee?: string[];
};

type CompanyRuleLike = {
  code?: string;
  name?: string;
  thesis?: string[];
  reasons?: string[];
  risks?: string[];
  evidenceNeeded?: string[];
};

export type WorldImpactBuildInputs = {
  reflections: WorldEventReflection[];
  candidates: CandidateLike[];
  universeCandidates: CandidateLike[];
  generatedCompanyRules: CompanyRuleLike[];
  today?: string;
  limit?: number;
};

const REVIEW_PATH = join("data", "world_event_impacts.jsonl");
const LATEST_PATH = join("data", "world_event_impacts_latest.json");
const HORIZON_DAYS: Record<WorldImpactHorizon, number> = { "1d": 1, "1w": 7, "1m": 30 };
const JQUANTS_DELAY_DAYS = 84;

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function safeStrings(values: unknown[]): string[] {
  return unique(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map(value => value.trim()));
}

function normalizeSourceQuality(value: string | undefined): WorldImpactSourceQuality {
  if (value === "official" || value === "tier1" || value === "tier2") return value;
  return "unknown";
}

function reviewKey(eventId: string, companyCode: string): string {
  return `${eventId}__${companyCode}`;
}

// ── v2: 影響メカニズム推定 ───────────────────────────────────
// テキスト（タグ・セクター・タイトル・仮説）からメカニズム分類を推定する。
// 確定情報ではなく調査の入口。該当なしは unknown。

const MECHANISM_KEYWORDS: Array<[WorldImpactMechanism, string[]]> = [
  ["semiconductor", ["semiconductor", "半導体", "chip", "ai", "datacenter", "データセンター", "gpu", "foundry", "製造装置"]],
  ["energy", ["energy", "電力", "エネルギー", "原油", "oil", "gas", "lng", "燃料", "再エネ", "原発", "nuclear", "power"]],
  ["defense", ["defense", "防衛", "安全保障", "military", "武器", "軍"]],
  ["travel", ["travel", "旅行", "インバウンド", "観光", "tourism", "airline", "hotel", "ホテル"]],
  ["logistics", ["logistics", "物流", "海運", "空運", "shipping", "港湾", "サプライチェーン", "supply chain", "cable", "ケーブル", "輸送"]],
  ["fx", ["fx", "為替", "円安", "円高", "currency", "dollar", "ドル"]],
  ["rates", ["rates", "金利", "利上げ", "利下げ", "国債", "yield", "中央銀行", "日銀", "frb", "fed", "boj"]],
  ["regulation", ["regulation", "規制", "政策", "法案", "制裁", "sanction", "関税", "tariff", "認可", "補助金"]],
  ["consumer", ["consumer", "消費", "小売", "retail", "値上げ", "賃上げ", "雇用統計"]],
  ["ip_brand", ["ip", "ブランド", "コンテンツ", "アニメ", "ゲーム", "entertainment", "media", "ライセンス"]],
  ["climate_disaster", ["climate", "災害", "地震", "台風", "洪水", "猛暑", "気候", "drought", "earthquake"]],
  ["geopolitical", ["geopolitical", "地政学", "戦争", "紛争", "侵攻", "war", "conflict", "中東", "ウクライナ", "台湾有事"]],
  ["cost", ["cost", "コスト", "原材料", "人件費", "資材", "インフレ", "inflation", "労働力", "labor", "staffing", "賃金"]],
  ["supply", ["supply", "供給", "不足", "shortage", "増産", "減産", "在庫", "disruption", "操業停止"]],
  ["demand", ["demand", "需要", "受注", "投資拡大", "出荷", "販売増", "特需"]],
];

export function inferMechanisms(texts: Array<string | null | undefined>): WorldImpactMechanism[] {
  const corpus = texts.filter((t): t is string => typeof t === "string").join(" ").toLowerCase();
  if (!corpus.trim()) return ["unknown"];
  const found: WorldImpactMechanism[] = [];
  for (const [mechanism, keywords] of MECHANISM_KEYWORDS) {
    if (keywords.some(keyword => corpus.includes(keyword))) found.push(mechanism);
  }
  return found.length > 0 ? found.slice(0, 5) : ["unknown"];
}

function isMechanism(value: unknown): value is WorldImpactMechanism {
  return typeof value === "string" && (WORLD_IMPACT_MECHANISMS as readonly string[]).includes(value);
}

const VALID_RESULTS = new Set(["hit", "miss", "inverse", "too_early", "unclear", "insufficient_data", "unknown"]);
const VALID_DIRECTIONS = new Set(["up", "down", "sideways", "mixed", "unknown"]);
const VALID_REVIEW_STATUS = new Set(["pending", "reviewed", "skipped", "insufficient_data"]);
const VALID_DIRECTION_CALLS = new Set(["positive", "negative", "mixed", "unclear"]);
const HORIZON_TO_LAG: Record<WorldImpactHorizon, number> = { "1d": 1, "1w": 7, "1m": 30 };

function isDue(dueAt: string, today: string): boolean {
  return dueAt <= today;
}

function isWithinDataDelay(dueAt: string, today: string): boolean {
  const due = new Date(`${dueAt}T00:00:00+09:00`).getTime();
  const now = new Date(`${today}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(now)) return true;
  const days = Math.floor((now - due) / 86400000);
  return days >= 0 && days < JQUANTS_DELAY_DAYS;
}

function dateForReflection(reflection: WorldEventReflection): string {
  const publishedAt = reflection.publishedAt ?? "";
  if (/^\d{4}-\d{2}-\d{2}/.test(publishedAt)) return publishedAt.slice(0, 10);
  return reflection.createdAt;
}

function buildOutcome(createdAt: string, horizon: WorldImpactHorizon, today: string): WorldEventImpactOutcome {
  const dueAt = addDaysJst(createdAt, HORIZON_DAYS[horizon]);
  const due = isDue(dueAt, today);
  const dataAvailability: WorldImpactDataAvailability = !due
    ? "ok"
    : isWithinDataDelay(dueAt, today)
      ? "priceDataPending"
      : "missing";
  return {
    horizon,
    dueAt,
    result: due ? null : "too_early",
    expectedDirection: "unknown",
    actualDirection: "unknown",
    dataAvailability,
    returnPct: null,
    topixReturnPct: null,
    relativeToTopixPct: null,
    missReason: null,
    missedSignals: [],
    lesson: null,
  };
}

// ── v2: normalize（v1 レコードや欠損フィールドの安全補完） ───
// 既存値は一切上書きしない。欠損のみ安全な既定値で埋めるため冪等。

function numberInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
}

function normalizeOutcome(raw: Record<string, unknown>): WorldEventImpactOutcome {
  const horizon = (raw.horizon === "1d" || raw.horizon === "1w" || raw.horizon === "1m") ? raw.horizon : "1m";
  const result = typeof raw.result === "string" && VALID_RESULTS.has(raw.result)
    ? (raw.result as WorldImpactResult)
    : null;
  const missReason = typeof raw.missReason === "string" && (WORLD_IMPACT_MISS_REASONS as readonly string[]).includes(raw.missReason)
    ? (raw.missReason as WorldImpactMissReason)
    : null;
  return {
    horizon,
    dueAt: typeof raw.dueAt === "string" ? raw.dueAt : "",
    result,
    expectedDirection: typeof raw.expectedDirection === "string" && VALID_DIRECTIONS.has(raw.expectedDirection) ? (raw.expectedDirection as WorldImpactDirection) : "unknown",
    actualDirection: typeof raw.actualDirection === "string" && VALID_DIRECTIONS.has(raw.actualDirection) ? (raw.actualDirection as WorldImpactDirection) : "unknown",
    dataAvailability: raw.dataAvailability === "ok" || raw.dataAvailability === "partial" || raw.dataAvailability === "priceDataPending" ? raw.dataAvailability : "missing",
    returnPct: typeof raw.returnPct === "number" && Number.isFinite(raw.returnPct) ? raw.returnPct : null,
    topixReturnPct: typeof raw.topixReturnPct === "number" && Number.isFinite(raw.topixReturnPct) ? raw.topixReturnPct : null,
    relativeToTopixPct: typeof raw.relativeToTopixPct === "number" && Number.isFinite(raw.relativeToTopixPct) ? raw.relativeToTopixPct : null,
    missReason,
    missedSignals: Array.isArray(raw.missedSignals) ? raw.missedSignals.filter((s): s is string => typeof s === "string") : [],
    lesson: typeof raw.lesson === "string" && raw.lesson.trim() ? raw.lesson : null,
  };
}

function deriveReviewStatus(outcomes: WorldEventImpactOutcome[], today: string): WorldImpactReviewStatus {
  if (outcomes.length === 0) return "pending";
  const evaluated = (o: WorldEventImpactOutcome) =>
    o.result != null && o.result !== "unknown" && o.result !== "too_early";
  if (outcomes.every(evaluated)) return "reviewed";
  const dueMissing = outcomes.some(o =>
    isDue(o.dueAt, today) && !evaluated(o) && o.dataAvailability === "missing"
  );
  if (dueMissing) return "insufficient_data";
  return "pending";
}

export function normalizeWorldImpactReview(rawValue: unknown, today = todayJst()): WorldEventImpactReview {
  const raw = (typeof rawValue === "object" && rawValue !== null ? rawValue : {}) as Record<string, unknown>;
  const outcomes = (Array.isArray(raw.outcomes) ? raw.outcomes : [])
    .map(o => normalizeOutcome((typeof o === "object" && o !== null ? o : {}) as Record<string, unknown>));
  const topic = typeof raw.topic === "string" ? raw.topic : "";
  const expectedMechanism = typeof raw.expectedMechanism === "string" ? raw.expectedMechanism : "";
  const counterArgument = typeof raw.counterArgument === "string" ? raw.counterArgument : "";
  const affectedSectors = Array.isArray(raw.affectedSectors) ? raw.affectedSectors.filter((s): s is string => typeof s === "string") : [];
  const affectedCompanyCodes = Array.isArray(raw.affectedCompanyCodes) ? raw.affectedCompanyCodes.filter((s): s is string => typeof s === "string") : [];
  const companyLinks = (Array.isArray(raw.companyLinks) ? raw.companyLinks : []) as WorldEventImpactCompanyLink[];

  const storedMechanisms = Array.isArray(raw.mechanisms) ? raw.mechanisms.filter(isMechanism) : [];
  const mechanisms = storedMechanisms.length > 0
    ? storedMechanisms
    : inferMechanisms([topic, expectedMechanism, ...affectedSectors]);

  const expectedHorizon = (raw.expectedHorizon === "1d" || raw.expectedHorizon === "1w" || raw.expectedHorizon === "1m") ? raw.expectedHorizon : "1m";
  const reviewDueAt = typeof raw.reviewDueAt === "string" && raw.reviewDueAt
    ? raw.reviewDueAt
    : outcomes.map(o => o.dueAt).filter(Boolean).sort().at(-1) ?? null;
  const reviewStatus = typeof raw.reviewStatus === "string" && VALID_REVIEW_STATUS.has(raw.reviewStatus)
    ? (raw.reviewStatus as WorldImpactReviewStatus)
    : deriveReviewStatus(outcomes, today);

  const rawImpactPath = (typeof raw.impactPath === "object" && raw.impactPath !== null ? raw.impactPath : null) as WorldImpactPath | null;
  const impactPath: WorldImpactPath = rawImpactPath && Array.isArray(rawImpactPath.mechanisms)
    ? {
        event: typeof rawImpactPath.event === "string" ? rawImpactPath.event : topic,
        mechanisms: rawImpactPath.mechanisms.filter(isMechanism),
        themes: Array.isArray(rawImpactPath.themes) ? rawImpactPath.themes.filter((s): s is string => typeof s === "string") : affectedSectors,
        companies: Array.isArray(rawImpactPath.companies) ? rawImpactPath.companies.filter((s): s is string => typeof s === "string") : affectedCompanyCodes,
        note: typeof rawImpactPath.note === "string" ? rawImpactPath.note : "",
      }
    : {
        event: topic,
        mechanisms,
        themes: affectedSectors,
        companies: affectedCompanyCodes,
        note: companyLinks[0]?.linkReason ?? "影響経路は未整理。一次情報で確認する。",
      };

  return {
    schemaVersion: 2,
    reviewKey: typeof raw.reviewKey === "string" ? raw.reviewKey : "",
    eventId: typeof raw.eventId === "string" ? raw.eventId : "",
    eventDate: typeof raw.eventDate === "string" ? raw.eventDate : "",
    topic,
    source: typeof raw.source === "string" ? raw.source : null,
    sourceQuality: normalizeSourceQuality(typeof raw.sourceQuality === "string" ? raw.sourceQuality : undefined),
    namedEntities: Array.isArray(raw.namedEntities) ? raw.namedEntities.filter((s): s is string => typeof s === "string") : [],
    affectedSectors,
    affectedCompanyCodes,
    companyLinks,
    expectedMechanism,
    secondOrderEffect: typeof raw.secondOrderEffect === "string" ? raw.secondOrderEffect : "",
    counterArgument,
    timeLag: typeof raw.timeLag === "string" ? raw.timeLag : "",
    expectedHorizon,
    dataAvailability: raw.dataAvailability === "ok" || raw.dataAvailability === "partial" || raw.dataAvailability === "priceDataPending" ? raw.dataAvailability : "missing",
    outcomes,
    missedSignals: Array.isArray(raw.missedSignals) ? raw.missedSignals.filter((s): s is string => typeof s === "string") : [],
    lesson: typeof raw.lesson === "string" && raw.lesson.trim() ? raw.lesson : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : today,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : today,
    mechanisms,
    impactPath,
    direction: typeof raw.direction === "string" && VALID_DIRECTION_CALLS.has(raw.direction) ? (raw.direction as WorldImpactDirectionCall) : "unclear",
    confidence: numberInRange(raw.confidence, 0, 1),
    expectedLagDays: typeof raw.expectedLagDays === "number" && Number.isFinite(raw.expectedLagDays)
      ? raw.expectedLagDays
      : HORIZON_TO_LAG[expectedHorizon],
    thesis: typeof raw.thesis === "string" && raw.thesis.trim() ? raw.thesis : expectedMechanism,
    falsification: typeof raw.falsification === "string" && raw.falsification.trim() ? raw.falsification : counterArgument,
    watchSignals: Array.isArray(raw.watchSignals) ? raw.watchSignals.filter((s): s is string => typeof s === "string") : [],
    riskFactors: Array.isArray(raw.riskFactors) ? raw.riskFactors.filter((s): s is string => typeof s === "string") : [],
    reviewDueAt,
    reviewStatus,
  };
}

function textForCandidate(candidate: CandidateLike, rule: CompanyRuleLike | undefined): string {
  return [
    candidate.code,
    candidate.name,
    candidate.sector,
    ...(candidate.tags ?? []),
    ...(candidate.reasons ?? []),
    ...(candidate.negativeReasons ?? []),
    ...(candidate.nextToSee ?? []),
    ...(rule?.thesis ?? []),
    ...(rule?.reasons ?? []),
    ...(rule?.risks ?? []),
    ...(rule?.evidenceNeeded ?? []),
  ].join(" ").toLowerCase();
}

function candidateLinks(inputs: WorldImpactBuildInputs, reflection: WorldEventReflection): WorldEventImpactCompanyLink[] {
  const rulesByCode = new Map(inputs.generatedCompanyRules.filter(rule => rule.code).map(rule => [String(rule.code), rule]));
  const candidates = [...inputs.candidates, ...inputs.universeCandidates];
  const tags = reflection.impactedTags.map(tag => tag.toLowerCase());
  const links = candidates.map(candidate => {
    const rule = rulesByCode.get(candidate.code);
    const text = textForCandidate(candidate, rule);
    const matchedTags = tags.filter(tag => text.includes(tag));
    const sectorMatch = candidate.sector && tags.some(tag => String(candidate.sector).toLowerCase().includes(tag));
    const score = matchedTags.length + (sectorMatch ? 1 : 0);
    return {
      score,
      link: {
        companyCode: candidate.code,
        companyName: candidate.name,
        matchedTags: unique([...matchedTags, ...(sectorMatch ? [String(candidate.sector)] : [])]).slice(0, 8),
        linkReason: matchedTags.length > 0
          ? `世界イベントの影響タグと銘柄タグ/仮説が重なるため、影響仮説として確認する。`
          : `既存の調査候補として、世界イベントとの接続を追加確認する。`,
      } satisfies WorldEventImpactCompanyLink,
    };
  });

  const matched = links.filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  if (matched.length > 0) return matched.map(item => item.link);
  return candidates.slice(0, 3).map(candidate => ({
    companyCode: candidate.code,
    companyName: candidate.name,
    matchedTags: [],
    linkReason: "直接タグ一致は弱いが、既存の調査候補として影響有無を確認する。",
  }));
}

export function buildWorldImpactReviews(inputs: WorldImpactBuildInputs): WorldEventImpactReview[] {
  const today = inputs.today ?? todayJst();
  const reflections = [...inputs.reflections]
    .filter(reflection => reflection.reviewStatus !== "ignored")
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, inputs.limit ?? 8);

  const reviews: WorldEventImpactReview[] = [];
  for (const reflection of reflections) {
    const links = candidateLinks(inputs, reflection);
    for (const link of links) {
      const outcomes = (["1d", "1w", "1m"] as const).map(horizon => buildOutcome(reflection.createdAt, horizon, today));
      const dataAvailability = outcomes.some(outcome => outcome.dataAvailability === "priceDataPending")
        ? "priceDataPending"
        : "missing";
      const sourceQuality = normalizeSourceQuality(reflection.sourceReliability);
      const mechanisms = inferMechanisms([
        reflection.title,
        reflection.thesis,
        ...reflection.impactedTags,
        ...reflection.categories,
        ...link.matchedTags,
      ]);
      // confidence の初期値は情報源の信頼度由来。検証前の仮説なので 0.6 を上限にする。
      const initialConfidence = sourceQuality === "official" ? 0.6 : sourceQuality === "tier1" ? 0.5 : sourceQuality === "tier2" ? 0.4 : 0.3;
      const reviewDueAt = outcomes.map(o => o.dueAt).filter(Boolean).sort().at(-1) ?? null;
      reviews.push({
        schemaVersion: 2,
        reviewKey: reviewKey(reflection.eventId, link.companyCode),
        eventId: reflection.eventId,
        eventDate: dateForReflection(reflection),
        topic: reflection.title,
        source: reflection.source ?? null,
        sourceQuality,
        namedEntities: safeStrings([reflection.source, ...reflection.possibleBeneficiaries, ...reflection.possibleRisks]).slice(0, 12),
        affectedSectors: reflection.impactedTags.slice(0, 12),
        affectedCompanyCodes: [link.companyCode],
        companyLinks: [link],
        expectedMechanism: reflection.thesis,
        secondOrderEffect: reflection.chainOfImpact.join(" / ") || "二次影響は未記録。一次情報と関連銘柄の開示で確認する。",
        counterArgument: reflection.invalidationSignals[0] ?? "一次情報で前提が確認できない場合は影響仮説を保留する。",
        timeLag: "1d/1w/1m で価格反応と一次情報の接続を分けて確認する。",
        expectedHorizon: "1m",
        dataAvailability,
        outcomes,
        missedSignals: [],
        lesson: null,
        createdAt: today,
        updatedAt: today,
        mechanisms,
        impactPath: {
          event: reflection.title,
          mechanisms,
          themes: reflection.impactedTags.slice(0, 12),
          companies: [link.companyCode],
          note: link.linkReason,
        },
        direction: "unclear",
        confidence: initialConfidence,
        expectedLagDays: HORIZON_TO_LAG["1m"],
        thesis: reflection.thesis,
        falsification: reflection.invalidationSignals.join(" / ") || "一次情報で前提が確認できない場合は影響仮説を保留する。",
        watchSignals: safeStrings([...reflection.evidenceNeeded]).slice(0, 8),
        riskFactors: safeStrings([...reflection.possibleRisks]).slice(0, 8),
        reviewDueAt,
        reviewStatus: "pending",
      });
    }
  }
  return dedupeReviews(reviews);
}

export function dedupeReviews(reviews: WorldEventImpactReview[]): WorldEventImpactReview[] {
  const seen = new Set<string>();
  const result: WorldEventImpactReview[] = [];
  for (const review of reviews) {
    if (seen.has(review.reviewKey)) continue;
    seen.add(review.reviewKey);
    result.push(review);
  }
  return result;
}

export function loadWorldImpactJsonl(path = REVIEW_PATH, today = todayJst()): { reviews: WorldEventImpactReview[]; parseErrors: number } {
  if (!existsSync(path)) return { reviews: [], parseErrors: 0 };
  let parseErrors = 0;
  const reviews = readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [normalizeWorldImpactReview(JSON.parse(line), today)];
      } catch {
        parseErrors++;
        return [];
      }
    });
  return { reviews, parseErrors };
}

export function loadWorldImpactReviews(path = REVIEW_PATH): WorldEventImpactReview[] {
  return loadWorldImpactJsonl(path).reviews;
}

export function mergeExistingReviews(existing: WorldEventImpactReview[], next: WorldEventImpactReview[]): WorldEventImpactReview[] {
  const map = new Map<string, WorldEventImpactReview>();
  for (const review of existing) map.set(review.reviewKey, review);
  for (const review of next) if (!map.has(review.reviewKey)) map.set(review.reviewKey, review);
  return [...map.values()];
}

export function saveWorldImpactReviews(reviews: WorldEventImpactReview[], path = REVIEW_PATH): number {
  const existing = loadWorldImpactReviews(path);
  const existingKeys = new Set(existing.map(review => review.reviewKey));
  const fresh = reviews.filter(review => !existingKeys.has(review.reviewKey));
  if (fresh.length === 0) return 0;
  ensureDir(path);
  appendFileSync(path, fresh.map(review => JSON.stringify(review)).join("\n") + "\n", "utf-8");
  return fresh.length;
}

export function writeWorldImpactLatest(reviews: WorldEventImpactReview[], path = LATEST_PATH): void {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(reviews, null, 2), "utf-8");
}

function outcomeLabel(outcome: WorldEventImpactOutcome): string {
  if (outcome.dataAvailability !== "ok") return "未評価: 価格データ不足";
  if (outcome.result == null || outcome.result === "unknown") return "未評価";
  if (outcome.result === "hit" && outcome.expectedDirection === "unknown" && outcome.actualDirection === "unknown") return "未評価: 方向未確定";
  if (outcome.result === "too_early") return "時期尚早";
  if (outcome.result === "miss") return "想定差分あり";
  return "仮説と整合";
}

export type WorldImpactAuditOptions = {
  jsonlParseErrors?: number;
  /** JSONL 側のキー集合。latest との不一致検出に使う */
  jsonlKeys?: string[];
};

export function buildWorldImpactAudit(reviews: WorldEventImpactReview[], today = todayJst(), options: WorldImpactAuditOptions = {}): WorldImpactAudit {
  const counts = new Map<string, number>();
  for (const review of reviews) counts.set(review.reviewKey, (counts.get(review.reviewKey) ?? 0) + 1);
  const horizonCounts = new Map<string, number>();
  for (const review of reviews) {
    const companyCode = review.companyLinks[0]?.companyCode ?? review.affectedCompanyCodes[0] ?? "unknown";
    for (const outcome of review.outcomes) {
      const key = `${review.eventId}__${companyCode}__${outcome.horizon}`;
      horizonCounts.set(key, (horizonCounts.get(key) ?? 0) + 1);
    }
  }
  const duplicateKeys = [
    ...[...counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
    ...[...horizonCounts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count })),
  ];
  const missingCounterArguments = reviews.filter(review => !review.counterArgument).length;
  const missingMechanisms = reviews.filter(review => !review.expectedMechanism).length;
  const sourceQualityUnknown = reviews.filter(review => review.sourceQuality === "unknown").length;
  const allOutcomes = reviews.flatMap(review => review.outcomes);
  const pendingReviews = allOutcomes.filter(outcome => outcome.result == null || outcome.result === "unknown").length;
  const priceDataPending = allOutcomes.filter(outcome => outcome.dataAvailability === "priceDataPending").length;
  const dataUnavailable = allOutcomes.filter(outcome => outcome.dataAvailability !== "ok").length;
  const overdueReviews = allOutcomes.filter(outcome =>
    isDue(outcome.dueAt, today) &&
    (outcome.result == null || outcome.result === "unknown") &&
    outcome.dataAvailability !== "priceDataPending"
  ).length;
  const unknownMatchedAsHit = allOutcomes.filter(outcome =>
    outcome.result === "hit" && outcome.expectedDirection === "unknown" && outcome.actualDirection === "unknown"
  ).length;

  // v2 監査項目
  const insufficientData = allOutcomes.filter(outcome => outcome.result === "insufficient_data").length
    + reviews.filter(review => review.reviewStatus === "insufficient_data").length;
  const confidenceMissing = reviews.filter(review => review.confidence == null).length;
  const mechanismUnknown = reviews.filter(review =>
    (review.mechanisms ?? []).length === 0 || (review.mechanisms ?? []).includes("unknown")
  ).length;
  const falsificationMissing = reviews.filter(review => !(review.falsification ?? review.counterArgument)).length;
  const jsonlParseErrors = options.jsonlParseErrors ?? 0;
  // dry-run では latest に未追記の候補が先行するのが正常なので、
  // 「JSONL に蓄積済みなのに latest から消えている」方向だけを不一致として扱う。
  const latestKeys = new Set(reviews.map(review => review.reviewKey));
  const jsonlKeys = options.jsonlKeys ?? null;
  const latestMismatch = jsonlKeys ? jsonlKeys.filter(key => !latestKeys.has(key)).length : 0;
  const reviewStatusCounts: Record<string, number> = {};
  for (const review of reviews) {
    const status = review.reviewStatus ?? "pending";
    reviewStatusCounts[status] = (reviewStatusCounts[status] ?? 0) + 1;
  }
  const outcomeResultCounts: Record<string, number> = {};
  for (const outcome of allOutcomes) {
    const key = outcome.result ?? "unevaluated";
    outcomeResultCounts[key] = (outcomeResultCounts[key] ?? 0) + 1;
  }
  const missReasonCounts: Record<string, number> = {};
  for (const outcome of allOutcomes) {
    if (outcome.missReason) missReasonCounts[outcome.missReason] = (missReasonCounts[outcome.missReason] ?? 0) + 1;
  }

  const priorityIssues: WorldImpactAudit["priorityIssues"] = [];
  if (jsonlParseErrors > 0) priorityIssues.push({ severity: "urgent", category: "jsonl", title: `JSONL parse error: ${jsonlParseErrors}件`, detail: "data/world_event_impacts.jsonl に破損行があります。" });
  if (latestMismatch > 0) priorityIssues.push({ severity: "attention", category: "latest_mismatch", title: `latest と JSONL の不一致: ${latestMismatch}件`, detail: "pnpm review:world-impact を再実行して latest を更新してください。" });
  if (mechanismUnknown > 0) priorityIssues.push({ severity: "attention", category: "mechanism_unknown", title: `mechanism 分類 unknown: ${mechanismUnknown}件`, detail: "影響メカニズムの分類が未確定です。pnpm backfill:world-impact で推定補完するか手動で分類してください。" });
  if (falsificationMissing > 0) priorityIssues.push({ severity: "attention", category: "falsification", title: `反証条件（falsification）未設定: ${falsificationMissing}件`, detail: "何が起きたら外れと見なすかを記録してください。" });
  if (confidenceMissing > 0) priorityIssues.push({ severity: "info", category: "confidence", title: `confidence 未設定: ${confidenceMissing}件`, detail: "pnpm backfill:world-impact で初期値を補完できます。" });
  if (duplicateKeys.length > 0) priorityIssues.push({ severity: "urgent", category: "duplicate", title: `重複キー: ${duplicateKeys.length}件`, detail: duplicateKeys.slice(0, 5).map(item => item.key).join(", ") });
  if (unknownMatchedAsHit > 0) priorityIssues.push({ severity: "urgent", category: "outcome", title: `unknown 同士の hit: ${unknownMatchedAsHit}件`, detail: "方向未確定のまま仮説と整合した扱いになっています。" });
  if (missingMechanisms > 0) priorityIssues.push({ severity: "attention", category: "mechanism", title: `影響メカニズム未記録: ${missingMechanisms}件`, detail: "expectedMechanism を補完してください。" });
  if (missingCounterArguments > 0) priorityIssues.push({ severity: "attention", category: "counter_argument", title: `反証条件未記録: ${missingCounterArguments}件`, detail: "counterArgument を補完してください。" });
  if (overdueReviews > 0) priorityIssues.push({ severity: "attention", category: "overdue", title: `期限超過の未評価: ${overdueReviews}件`, detail: "価格データ提供待ち以外の未評価があります。" });
  if (sourceQualityUnknown > 0) priorityIssues.push({ severity: "info", category: "source_quality", title: `sourceQuality 不明: ${sourceQualityUnknown}件`, detail: "一次情報またはTier1報道で確認してください。" });
  if (priceDataPending > 0) priorityIssues.push({ severity: "info", category: "price_data", title: `価格データ提供待ち: ${priceDataPending}件`, detail: "J-Quants 遅延範囲のため、提供後に再確認してください。" });

  const healthStatus = priorityIssues.some(issue => issue.severity === "urgent")
    ? "action_required"
    : priorityIssues.some(issue => issue.severity === "attention")
      ? "needs_attention"
      : "ok";

  return {
    schemaVersion: 1,
    generatedAt: today,
    healthStatus,
    totalReviews: reviews.length,
    pendingReviews,
    overdueReviews,
    missingCounterArguments,
    missingMechanisms,
    dataUnavailable,
    priceDataPending,
    sourceQualityUnknown,
    unknownMatchedAsHit,
    duplicateKeys,
    insufficientData,
    confidenceMissing,
    mechanismUnknown,
    falsificationMissing,
    jsonlParseErrors,
    latestMismatch,
    reviewStatusCounts,
    outcomeResultCounts,
    missReasonCounts,
    priorityIssues,
  };
}

// ── v2: キャリブレーション（confidence帯 / mechanism / lag 別精度） ──

const CALIBRATION_MIN_SAMPLE = 5;

function confidenceBand(confidence: number | null): string {
  if (confidence == null) return "unset";
  if (confidence < 0.34) return "low (<0.34)";
  if (confidence < 0.67) return "mid (0.34-0.66)";
  return "high (>=0.67)";
}

function calibrationRow(groupType: WorldImpactCalibrationRow["groupType"], groupKey: string, outcomes: WorldEventImpactOutcome[]): WorldImpactCalibrationRow {
  const evaluatedOutcomes = outcomes.filter(o => o.result === "hit" || o.result === "miss" || o.result === "inverse");
  const hit = evaluatedOutcomes.filter(o => o.result === "hit").length;
  const miss = evaluatedOutcomes.filter(o => o.result === "miss").length;
  const inverse = evaluatedOutcomes.filter(o => o.result === "inverse").length;
  const sampleTooSmall = evaluatedOutcomes.length < CALIBRATION_MIN_SAMPLE;
  return {
    groupType,
    groupKey,
    total: outcomes.length,
    evaluated: evaluatedOutcomes.length,
    hit,
    miss,
    inverse,
    hitRate: evaluatedOutcomes.length > 0 ? hit / evaluatedOutcomes.length : null,
    sampleTooSmall,
    note: sampleTooSmall ? "サンプル不足。統計的判断の根拠にしない。" : "参考値。投資助言ではない。",
  };
}

export function buildWorldImpactCalibration(reviews: WorldEventImpactReview[], today = todayJst()): WorldImpactCalibration {
  const byConfidence = new Map<string, WorldEventImpactOutcome[]>();
  const byMechanism = new Map<string, WorldEventImpactOutcome[]>();
  const byLag = new Map<string, WorldEventImpactOutcome[]>();
  for (const review of reviews) {
    const confKey = confidenceBand(review.confidence ?? null);
    for (const outcome of review.outcomes) {
      byConfidence.set(confKey, [...(byConfidence.get(confKey) ?? []), outcome]);
      for (const mechanism of (review.mechanisms ?? ["unknown"])) {
        byMechanism.set(mechanism, [...(byMechanism.get(mechanism) ?? []), outcome]);
      }
      byLag.set(outcome.horizon, [...(byLag.get(outcome.horizon) ?? []), outcome]);
    }
  }
  const rows: WorldImpactCalibrationRow[] = [
    ...[...byConfidence.entries()].map(([key, outcomes]) => calibrationRow("confidence", key, outcomes)),
    ...[...byMechanism.entries()].map(([key, outcomes]) => calibrationRow("mechanism", key, outcomes)),
    ...[...byLag.entries()].map(([key, outcomes]) => calibrationRow("lag", key, outcomes)),
  ];
  const evaluatedOutcomes = reviews.flatMap(r => r.outcomes).filter(o => o.result === "hit" || o.result === "miss" || o.result === "inverse").length;
  return {
    schemaVersion: 1,
    generatedAt: today,
    totalReviews: reviews.length,
    evaluatedOutcomes,
    rows,
    notes: [
      "confidence帯・mechanism・lag 別の検証結果集計です。投資助言ではありません。",
      `評価済み outcome が ${CALIBRATION_MIN_SAMPLE} 件未満のグループは sampleTooSmall=true として参考値扱いです。`,
    ],
  };
}

export function renderWorldImpactReviewMarkdown(reviews: WorldEventImpactReview[], generatedAt: string, didWrite: boolean): string {
  const lines: string[] = [];
  lines.push("# 世界ニュース影響仮説レビュー");
  lines.push("");
  lines.push(`生成日: ${generatedAt}`);
  lines.push(`mode: ${didWrite ? "write" : "dry-run"}`);
  lines.push("");
  lines.push("> 世界ニュースを銘柄への影響仮説として保存するための研究ログです。投資助言ではありません。");
  lines.push("");
  if (reviews.length === 0) {
    lines.push("- 作成候補なし");
  }
  for (const review of reviews.slice(0, 30)) {
    const link = review.companyLinks[0];
    lines.push(`## ${review.topic}`);
    lines.push("");
    lines.push(`- 銘柄: ${link?.companyCode ?? "-"} ${link?.companyName ?? "-"}`);
    lines.push(`- sourceQuality: ${review.sourceQuality}`);
    lines.push(`- mechanisms: ${(review.mechanisms ?? []).join(", ") || "unknown"}`);
    lines.push(`- 影響経路: ${review.impactPath ? `${review.impactPath.event} → ${review.impactPath.mechanisms.join("/")} → ${review.impactPath.themes.slice(0, 5).join("/") || "-"} → ${review.impactPath.companies.join("/")}` : "未整理"}`);
    lines.push(`- direction: ${review.direction ?? "unclear"} / confidence: ${review.confidence ?? "未設定"} / expectedLagDays: ${review.expectedLagDays ?? "未設定"}`);
    lines.push(`- affectedSectors: ${review.affectedSectors.slice(0, 8).join(", ") || "未記録"}`);
    lines.push(`- thesis: ${review.thesis || review.expectedMechanism || "未記録"}`);
    lines.push(`- secondOrderEffect: ${review.secondOrderEffect}`);
    lines.push(`- falsification: ${review.falsification || review.counterArgument || "未設定"}`);
    lines.push(`- watchSignals: ${(review.watchSignals ?? []).join(", ") || "未記録"}`);
    lines.push(`- riskFactors: ${(review.riskFactors ?? []).join(", ") || "未記録"}`);
    lines.push(`- reviewDueAt: ${review.reviewDueAt ?? "未設定"} / reviewStatus: ${review.reviewStatus ?? "pending"}`);
    lines.push(`- timeLag: ${review.timeLag}`);
    lines.push(`- outcomes: ${review.outcomes.map(outcome => `${outcome.horizon}=${outcomeLabel(outcome)}`).join(" / ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderWorldImpactAuditMarkdown(audit: WorldImpactAudit): string {
  const lines: string[] = [];
  lines.push("# 世界ニュース影響仮説 監査");
  lines.push("");
  lines.push(`生成日: ${audit.generatedAt}`);
  lines.push(`healthStatus: ${audit.healthStatus}`);
  lines.push("");
  lines.push(`- totalReviews: ${audit.totalReviews}`);
  lines.push(`- pendingReviews: ${audit.pendingReviews}`);
  lines.push(`- overdueReviews: ${audit.overdueReviews}`);
  lines.push(`- missingCounterArguments: ${audit.missingCounterArguments}`);
  lines.push(`- missingMechanisms: ${audit.missingMechanisms}`);
  lines.push(`- dataUnavailable: ${audit.dataUnavailable}`);
  lines.push(`- priceDataPending: ${audit.priceDataPending}`);
  lines.push(`- sourceQualityUnknown: ${audit.sourceQualityUnknown}`);
  lines.push(`- unknownMatchedAsHit: ${audit.unknownMatchedAsHit}`);
  lines.push(`- insufficientData: ${audit.insufficientData}`);
  lines.push(`- confidenceMissing: ${audit.confidenceMissing}`);
  lines.push(`- mechanismUnknown: ${audit.mechanismUnknown}`);
  lines.push(`- falsificationMissing: ${audit.falsificationMissing}`);
  lines.push(`- jsonlParseErrors: ${audit.jsonlParseErrors}`);
  lines.push(`- latestMismatch: ${audit.latestMismatch}`);
  lines.push(`- reviewStatus: ${Object.entries(audit.reviewStatusCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "なし"}`);
  lines.push(`- outcomeResult: ${Object.entries(audit.outcomeResultCounts).map(([k, v]) => `${k}=${v}`).join(", ") || "なし"}`);
  lines.push("");
  lines.push("## priorityIssues");
  lines.push("");
  if (audit.priorityIssues.length === 0) {
    lines.push("- 指摘なし");
  } else {
    for (const issue of audit.priorityIssues) {
      lines.push(`- [${issue.severity}] ${issue.title}: ${issue.detail}`);
    }
  }
  lines.push("");
  lines.push("> 未評価と価格データ不足を優先して表示し、断定を避けます。");
  return lines.join("\n");
}

// ── v2: World Impact Intelligence レポート ───────────────────

export function renderWorldImpactIntelligenceMarkdown(
  reviews: WorldEventImpactReview[],
  audit: WorldImpactAudit,
  calibration: WorldImpactCalibration,
  generatedAt: string
): string {
  const lines: string[] = [];
  lines.push("# World Impact Intelligence");
  lines.push("");
  lines.push(`生成日: ${generatedAt}`);
  lines.push("");
  lines.push("> 世界ニュース → 影響メカニズム → 銘柄 → 検証可能仮説 → レビュー → 学習メモ の一気通貫ログです。投資助言ではありません。");
  lines.push("");

  lines.push("## サマリー");
  lines.push("");
  lines.push("| 項目 | 件数 |");
  lines.push("|---|---:|");
  lines.push(`| 影響仮説レビュー総数 | ${audit.totalReviews} |`);
  lines.push(`| pending（未検証） | ${audit.reviewStatusCounts["pending"] ?? 0} |`);
  lines.push(`| reviewed（検証済み） | ${audit.reviewStatusCounts["reviewed"] ?? 0} |`);
  lines.push(`| insufficient_data（データ不足） | ${audit.reviewStatusCounts["insufficient_data"] ?? 0} |`);
  lines.push(`| skipped | ${audit.reviewStatusCounts["skipped"] ?? 0} |`);
  lines.push(`| 期限超過の未評価 outcome | ${audit.overdueReviews} |`);
  lines.push(`| 価格データ提供待ち outcome | ${audit.priceDataPending} |`);
  lines.push("");

  lines.push("## mechanism 別件数");
  lines.push("");
  const mechanismCounts = new Map<string, number>();
  for (const review of reviews) {
    for (const mechanism of (review.mechanisms ?? ["unknown"])) {
      mechanismCounts.set(mechanism, (mechanismCounts.get(mechanism) ?? 0) + 1);
    }
  }
  if (mechanismCounts.size === 0) {
    lines.push("- データなし");
  } else {
    lines.push("| mechanism | 件数 |");
    lines.push("|---|---:|");
    for (const [mechanism, count] of [...mechanismCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${mechanism} | ${count} |`);
    }
  }
  lines.push("");

  lines.push("## confidence 帯別件数");
  lines.push("");
  const confRows = calibration.rows.filter(row => row.groupType === "confidence");
  if (confRows.length === 0) {
    lines.push("- データなし");
  } else {
    lines.push("| 帯 | outcome数 | 評価済み | 整合 | 差分 | 逆行 |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const row of confRows) {
      lines.push(`| ${row.groupKey} | ${row.total} | ${row.evaluated} | ${row.hit} | ${row.miss} | ${row.inverse} |`);
    }
  }
  lines.push("");

  lines.push("## outcome 別件数");
  lines.push("");
  const outcomeEntries = Object.entries(audit.outcomeResultCounts);
  if (outcomeEntries.length === 0) {
    lines.push("- データなし");
  } else {
    lines.push("| result | 件数 |");
    lines.push("|---|---:|");
    for (const [key, count] of outcomeEntries.sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${key} | ${count} |`);
    }
  }
  lines.push("");

  lines.push("## 外れ理由ランキング");
  lines.push("");
  const missEntries = Object.entries(audit.missReasonCounts).sort((a, b) => b[1] - a[1]);
  if (missEntries.length === 0) {
    lines.push("- まだ外れ理由の記録なし（検証済み仮説が増えると蓄積されます）");
  } else {
    lines.push("| 外れ理由 | 件数 |");
    lines.push("|---|---:|");
    for (const [reason, count] of missEntries) {
      const label = WORLD_IMPACT_MISS_REASON_LABELS[reason as WorldImpactMissReason] ?? reason;
      lines.push(`| ${label} (${reason}) | ${count} |`);
    }
  }
  lines.push("");

  lines.push("## 次に改善すべき仮説生成ルール");
  lines.push("");
  const improvements: string[] = [];
  if (audit.mechanismUnknown > 0) improvements.push(`mechanism unknown が ${audit.mechanismUnknown}件。タグ→メカニズム対応表（MECHANISM_KEYWORDS）の拡充を検討。`);
  if (audit.falsificationMissing > 0) improvements.push(`falsification 未設定が ${audit.falsificationMissing}件。仮説作成時に反証条件を必須にする。`);
  if (audit.confidenceMissing > 0) improvements.push(`confidence 未設定が ${audit.confidenceMissing}件。backfill で初期値を補完する。`);
  const topMiss = missEntries[0];
  if (topMiss) {
    const label = WORLD_IMPACT_MISS_REASON_LABELS[topMiss[0] as WorldImpactMissReason] ?? topMiss[0];
    improvements.push(`外れ理由の最多は「${label}」(${topMiss[1]}件)。この理由を潰す事前チェックを仮説生成に追加する。`);
  }
  if (calibration.evaluatedOutcomes === 0) improvements.push("評価済み outcome がまだ0件。レビュー期限到来後に pnpm review:world-impact で答え合わせを進める。");
  if (improvements.length === 0) improvements.push("現時点で目立つ改善対象なし。検証サンプルを増やす。");
  for (const item of improvements) lines.push(`- ${item}`);
  lines.push("");

  lines.push("## データ品質上の問題");
  lines.push("");
  if (audit.priorityIssues.length === 0) {
    lines.push("- 指摘なし");
  } else {
    for (const issue of audit.priorityIssues) {
      lines.push(`- [${issue.severity}] ${issue.title}: ${issue.detail}`);
    }
  }
  lines.push("");

  lines.push("## まだ未実装・未検証のこと");
  lines.push("");
  lines.push("- actualReturn / relativeReturnToTopix の自動補完（J-Quants 提供遅延84日のため当面は提供待ち）");
  lines.push("- 評価済みサンプルが少なく、calibration はまだ参考値にならない");
  lines.push("- direction（positive/negative）の自動推定は未実装。現状は unclear 起点で手動更新");
  lines.push("- 外れ理由の自動分類は未実装。レビュー時に手動で missReason を記録する");
  lines.push("");
  lines.push("> このレポートは検証・学習のための研究ログです。売買の推奨は行いません。");
  return lines.join("\n");
}
