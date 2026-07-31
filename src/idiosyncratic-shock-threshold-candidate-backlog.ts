// Threshold research用の「未採点candidate backlog」。
// historical returnを見てから都合の良い事例だけ採用するselection biasを減らすため、
// score/priceState/recovery/returnを持たない構造情報だけを先にfreezeする。

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import type { ShockMarket } from "./idiosyncratic-shock-market.js";
import type { ShockSource } from "./idiosyncratic-shock.js";
import {
  THRESHOLD_DIVERSITY_TARGETS,
  summarizeThresholdDiversity,
  type ThresholdDiversityRow,
} from "./idiosyncratic-shock-threshold-diversity-audit.js";

export type ThresholdCandidateResearchState = "unscored" | "researching" | "promoted" | "rejected";

export type ThresholdCandidateBacklogRow = {
  id: string;
  company: string;
  ticker: string;
  market: Extract<ShockMarket, "JP" | "US">;
  eventDate: string;
  category: string;
  researchState: ThresholdCandidateResearchState;
  discoveryReason: string;
  primarySource: ShockSource & { publishedAt: string };
};

export type ThresholdCandidateBacklog = {
  version: 1;
  generatedAt: string;
  description: string;
  selectionPolicy: {
    basis: "structural_coverage_only";
    knownHistoricalOutcomeMayExist: true;
    forbiddenInputs: string[];
  };
  candidates: ThresholdCandidateBacklogRow[];
};

export type ThresholdCandidatePriorityRow = ThresholdCandidateBacklogRow & {
  priorityScore: number;
  gapReasons: string[];
};

export type ThresholdCandidateBacklogStatus = {
  totalCandidateCount: number;
  activeCandidateCount: number;
  promotedCount: number;
  rejectedCount: number;
  thresholdChangeReady: boolean;
  replenishmentRequired: boolean;
  blockers: string[];
};

const DEFAULT_PATH = "data/idiosyncratic_shock_threshold_candidate_backlog.yml";
const BACKLOG_EXPANSION_PATTERN = /^idiosyncratic_shock_threshold_candidate_backlog_expansion_\d+\.yml$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ALLOWED_STATES = new Set<ThresholdCandidateResearchState>(["unscored", "researching", "promoted", "rejected"]);
const PRIMARY_SOURCE_TYPES = new Set<ShockSource["sourceType"]>(["company", "regulator", "exchange"]);
const REQUIRED_FORBIDDEN_INPUTS = ["future_return", "recovery_pattern", "realized_outcome", "post_event_price_path"];
const FORBIDDEN_CANDIDATE_KEY = /score(?:vector)?|price[_-]?state|return|recovery|outcome|realized|future[_-]?price|post[_-]?event[_-]?price/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertDate(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) throw new Error(`${label}: YYYY-MM-DD required`);
}

function assertNoForbiddenCandidateKeys(value: unknown, label: string): void {
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CANDIDATE_KEY.test(key)) {
      throw new Error(`${label}: forbidden pre-score/pre-outcome field ${key}`);
    }
    if (isPlainObject(child)) assertNoForbiddenCandidateKeys(child, `${label}.${key}`);
  }
}

function validateSource(value: unknown, label: string, generatedAt: string): ThresholdCandidateBacklogRow["primarySource"] {
  if (!isPlainObject(value)) throw new Error(`${label}: primarySource object required`);
  const { title, url, sourceType, publishedAt } = value;
  if (typeof title !== "string" || title.trim().length < 3) throw new Error(`${label}.title: non-empty title required`);
  if (typeof url !== "string") throw new Error(`${label}.url: URL required`);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("https only");
  } catch {
    throw new Error(`${label}.url: valid https URL required`);
  }
  if (typeof sourceType !== "string" || !PRIMARY_SOURCE_TYPES.has(sourceType as ShockSource["sourceType"])) {
    throw new Error(`${label}.sourceType: company/regulator/exchange required`);
  }
  assertDate(publishedAt, `${label}.publishedAt`);
  if (publishedAt > generatedAt) throw new Error(`${label}.publishedAt: cannot be after backlog generatedAt`);
  return {
    title: title.trim(),
    url,
    sourceType: sourceType as ShockSource["sourceType"],
    publishedAt,
  };
}

function validateCandidate(value: unknown, index: number, generatedAt: string): ThresholdCandidateBacklogRow {
  const label = `candidates[${index}]`;
  if (!isPlainObject(value)) throw new Error(`${label}: object required`);
  assertNoForbiddenCandidateKeys(value, label);

  const { id, company, ticker, market, eventDate, category, researchState, discoveryReason, primarySource } = value;
  if (typeof id !== "string" || !ID_RE.test(id)) throw new Error(`${label}.id: lowercase slug required`);
  if (typeof company !== "string" || company.trim().length < 2) throw new Error(`${label}.company: required`);
  if (typeof ticker !== "string" || ticker.trim().length < 1) throw new Error(`${label}.ticker: required`);
  if (market !== "JP" && market !== "US") throw new Error(`${label}.market: JP or US required`);
  assertDate(eventDate, `${label}.eventDate`);
  if (eventDate > generatedAt) throw new Error(`${label}.eventDate: cannot be in the future`);
  if (typeof category !== "string" || category.trim().length < 3) throw new Error(`${label}.category: required`);
  if (typeof researchState !== "string" || !ALLOWED_STATES.has(researchState as ThresholdCandidateResearchState)) {
    throw new Error(`${label}.researchState: invalid state`);
  }
  if (typeof discoveryReason !== "string" || discoveryReason.trim().length < 20) {
    throw new Error(`${label}.discoveryReason: structural selection reason required`);
  }

  return {
    id,
    company: company.trim(),
    ticker: ticker.trim(),
    market,
    eventDate,
    category: category.trim(),
    researchState: researchState as ThresholdCandidateResearchState,
    discoveryReason: discoveryReason.trim(),
    primarySource: validateSource(primarySource, `${label}.primarySource`, generatedAt),
  };
}

export function validateThresholdCandidateBacklogPayload(value: unknown, label = "threshold candidate backlog"): ThresholdCandidateBacklog {
  if (!isPlainObject(value)) throw new Error(`${label}: object required`);
  if (value.version !== 1) throw new Error(`${label}.version: expected 1`);
  assertDate(value.generatedAt, `${label}.generatedAt`);
  if (typeof value.description !== "string" || value.description.trim().length < 20) throw new Error(`${label}.description: required`);
  if (!isPlainObject(value.selectionPolicy)) throw new Error(`${label}.selectionPolicy: required`);
  if (value.selectionPolicy.basis !== "structural_coverage_only") throw new Error(`${label}.selectionPolicy.basis: structural_coverage_only required`);
  if (value.selectionPolicy.knownHistoricalOutcomeMayExist !== true) {
    throw new Error(`${label}.selectionPolicy.knownHistoricalOutcomeMayExist: historical availability must be acknowledged`);
  }
  if (!Array.isArray(value.selectionPolicy.forbiddenInputs)) throw new Error(`${label}.selectionPolicy.forbiddenInputs: array required`);
  for (const input of REQUIRED_FORBIDDEN_INPUTS) {
    if (!value.selectionPolicy.forbiddenInputs.includes(input)) throw new Error(`${label}.selectionPolicy.forbiddenInputs: missing ${input}`);
  }
  if (!Array.isArray(value.candidates)) throw new Error(`${label}.candidates: array required`);

  const candidates = value.candidates.map((candidate, index) => validateCandidate(candidate, index, value.generatedAt as string));
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) throw new Error(`${label}: duplicate candidate id ${candidate.id}`);
    ids.add(candidate.id);
  }

  return {
    version: 1,
    generatedAt: value.generatedAt as string,
    description: value.description.trim(),
    selectionPolicy: {
      basis: "structural_coverage_only",
      knownHistoricalOutcomeMayExist: true,
      forbiddenInputs: [...value.selectionPolicy.forbiddenInputs] as string[],
    },
    candidates,
  };
}

function defaultBacklogPaths(): string[] {
  const dataDir = "data";
  const expansions = existsSync(dataDir)
    ? readdirSync(dataDir)
      .filter(name => BACKLOG_EXPANSION_PATTERN.test(name))
      .sort()
      .map(name => join(dataDir, name))
    : [];
  return [DEFAULT_PATH, ...expansions].filter(existsSync);
}

function normalizedForbiddenInputs(backlog: ThresholdCandidateBacklog): string {
  return [...backlog.selectionPolicy.forbiddenInputs].sort().join("|");
}

export function loadThresholdCandidateBacklog(path?: string): ThresholdCandidateBacklog {
  const paths = path ? [path] : defaultBacklogPaths();
  if (paths.length === 0) throw new Error("threshold candidate backlog: no backlog files found");

  let base: ThresholdCandidateBacklog | null = null;
  let generatedAt = "0000-00-00";
  const candidates: ThresholdCandidateBacklogRow[] = [];
  const ids = new Set<string>();

  for (const currentPath of paths) {
    const parsed = validateThresholdCandidateBacklogPayload(load(readFileSync(currentPath, "utf-8")), currentPath);
    if (base == null) {
      base = parsed;
    } else if (normalizedForbiddenInputs(parsed) !== normalizedForbiddenInputs(base)) {
      throw new Error(`${currentPath}: selectionPolicy.forbiddenInputs must match base backlog`);
    }

    generatedAt = generatedAt > parsed.generatedAt ? generatedAt : parsed.generatedAt;
    for (const candidate of parsed.candidates) {
      if (ids.has(candidate.id)) throw new Error(`duplicate threshold candidate backlog id: ${candidate.id}`);
      ids.add(candidate.id);
      candidates.push(candidate);
    }
  }

  if (base == null) throw new Error("threshold candidate backlog: base backlog missing");
  return {
    ...base,
    generatedAt,
    description: paths.length === 1 ? base.description : `${base.description} mergedFiles=${paths.length}`,
    candidates,
  };
}

function deficit(target: number, actual: number): number {
  return Math.max(0, target - actual);
}

export function rankThresholdCandidateBacklog(
  candidates: ThresholdCandidateBacklogRow[],
  rows: ThresholdDiversityRow[],
): ThresholdCandidatePriorityRow[] {
  const controls = rows.filter(row => row.calibrationEligibility === "confirmed_pass" && row.replayReady && row.supportedMarket);
  const categories = new Set(controls.map(row => row.category));
  const jpDeficit = deficit(THRESHOLD_DIVERSITY_TARGETS.jpControls, controls.filter(row => row.market === "JP").length);
  const usDeficit = deficit(THRESHOLD_DIVERSITY_TARGETS.usControls, controls.filter(row => row.market === "US").length);
  const categoryDeficit = deficit(THRESHOLD_DIVERSITY_TARGETS.distinctCategories, categories.size);
  const totalDeficit = deficit(THRESHOLD_DIVERSITY_TARGETS.totalReplayReadyBelow12, controls.length);

  return candidates
    .filter(candidate => candidate.researchState === "unscored" || candidate.researchState === "researching")
    .map(candidate => {
      let priorityScore = 0;
      const gapReasons: string[] = ["score band intentionally unknown until PIT-safe scoring"];

      if (candidate.market === "JP" && jpDeficit > 0) {
        priorityScore += 20 * jpDeficit;
        gapReasons.push(`JP control deficit ${jpDeficit}`);
      }
      if (candidate.market === "US" && usDeficit > 0) {
        priorityScore += 20 * usDeficit;
        gapReasons.push(`US control deficit ${usDeficit}`);
      }
      if (!categories.has(candidate.category) && categoryDeficit > 0) {
        priorityScore += 15 * categoryDeficit;
        gapReasons.push(`new category coverage: ${candidate.category}`);
      }
      if (PRIMARY_SOURCE_TYPES.has(candidate.primarySource.sourceType)) {
        priorityScore += 5;
        gapReasons.push("primary source already pinned");
      }
      if (candidate.researchState === "researching") {
        priorityScore += 2;
        gapReasons.push("research already in progress");
      }
      if (totalDeficit > 0) priorityScore += totalDeficit;

      return { ...candidate, priorityScore, gapReasons };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.market.localeCompare(b.market) || a.id.localeCompare(b.id));
}

export function summarizeThresholdCandidateBacklogStatus(
  candidates: ThresholdCandidateBacklogRow[],
  rows: ThresholdDiversityRow[],
): ThresholdCandidateBacklogStatus {
  const diversity = summarizeThresholdDiversity(rows);
  const active = rankThresholdCandidateBacklog(candidates, rows);
  const promotedCount = candidates.filter(candidate => candidate.researchState === "promoted").length;
  const rejectedCount = candidates.filter(candidate => candidate.researchState === "rejected").length;
  const replenishmentRequired = !diversity.ready && active.length === 0;
  const blockers = [...diversity.blockers];
  if (replenishmentRequired) {
    blockers.push("active threshold candidate backlog exhausted while threshold diversity is not ready");
  }

  return {
    totalCandidateCount: candidates.length,
    activeCandidateCount: active.length,
    promotedCount,
    rejectedCount,
    thresholdChangeReady: diversity.ready,
    replenishmentRequired,
    blockers,
  };
}
