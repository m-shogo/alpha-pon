import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { addDaysJst, todayJst } from "./date.js";
import type { WorldEventReflection } from "./analysis/world-event-reflection.js";

export type WorldImpactSourceQuality = "official" | "tier1" | "tier2" | "unknown";
export type WorldImpactDataAvailability = "ok" | "partial" | "missing" | "priceDataPending";
export type WorldImpactResult = "hit" | "miss" | "too_early" | "unknown" | null;
export type WorldImpactDirection = "up" | "down" | "sideways" | "mixed" | "unknown";
export type WorldImpactHorizon = "1d" | "1w" | "1m";

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
  schemaVersion: 1;
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
  priorityIssues: Array<{
    severity: "urgent" | "attention" | "info";
    category: string;
    title: string;
    detail: string;
  }>;
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
    missedSignals: [],
    lesson: null,
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
      reviews.push({
        schemaVersion: 1,
        reviewKey: reviewKey(reflection.eventId, link.companyCode),
        eventId: reflection.eventId,
        eventDate: dateForReflection(reflection),
        topic: reflection.title,
        source: reflection.source ?? null,
        sourceQuality: normalizeSourceQuality(reflection.sourceReliability),
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

export function loadWorldImpactReviews(path = REVIEW_PATH): WorldEventImpactReview[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as WorldEventImpactReview];
      } catch {
        return [];
      }
    });
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

export function buildWorldImpactAudit(reviews: WorldEventImpactReview[], today = todayJst()): WorldImpactAudit {
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

  const priorityIssues: WorldImpactAudit["priorityIssues"] = [];
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
    priorityIssues,
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
    lines.push(`- affectedSectors: ${review.affectedSectors.slice(0, 8).join(", ") || "未記録"}`);
    lines.push(`- expectedMechanism: ${review.expectedMechanism}`);
    lines.push(`- secondOrderEffect: ${review.secondOrderEffect}`);
    lines.push(`- counterArgument: ${review.counterArgument}`);
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
