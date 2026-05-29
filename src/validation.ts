import type { WatchlistConfig, Candidate, Market, Priority, CandidateStatus } from "./types.js";

const VALID_MARKETS = new Set<Market>(["TSE", "NYSE", "NASDAQ"]);
const VALID_PRIORITIES = new Set<Priority>(["S", "A", "B", "C"]);
const VALID_STATUSES = new Set<CandidateStatus>([
  "candidate",
  "research",
  "watch",
  "active",
  "ignore",
  "expired",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCandidate(candidate: Candidate, index: number): string[] {
  const errors: string[] = [];
  const label = candidate.code && candidate.name
    ? `${candidate.code} ${candidate.name}`
    : `symbols[${index}]`;

  if (!isNonEmptyString(candidate.code)) {
    errors.push(`${label}: code が空です`);
  }

  if (!isNonEmptyString(candidate.name)) {
    errors.push(`${label}: name が空です`);
  }

  if (!VALID_MARKETS.has(candidate.market)) {
    errors.push(`${label}: market が不正です (${candidate.market})`);
  }

  if (!VALID_PRIORITIES.has(candidate.priority)) {
    errors.push(`${label}: priority が不正です (${candidate.priority})`);
  }

  if (!VALID_STATUSES.has(candidate.status)) {
    errors.push(`${label}: status が不正です (${candidate.status})`);
  }

  if (!Array.isArray(candidate.tags)) {
    errors.push(`${label}: tags は配列にしてください`);
  } else if (candidate.status !== "ignore" && candidate.tags.length === 0) {
    errors.push(`${label}: tags が空です`);
  }

  if (!Array.isArray(candidate.rules)) {
    errors.push(`${label}: rules は配列にしてください`);
  } else if (candidate.status !== "ignore" && candidate.rules.length === 0) {
    errors.push(`${label}: rules が空です`);
  }

  if (candidate.listedAt && !/^\d{4}-\d{2}-\d{2}$/.test(candidate.listedAt)) {
    errors.push(`${label}: listedAt は YYYY-MM-DD 形式にしてください`);
  }

  return errors;
}

export function validateWatchlist(config: WatchlistConfig): string[] {
  const errors: string[] = [];

  if (!config || !Array.isArray(config.symbols)) {
    return ["watchlist.yml: symbols 配列がありません"];
  }

  const seen = new Set<string>();

  config.symbols.forEach((candidate, index) => {
    errors.push(...validateCandidate(candidate, index));

    if (candidate.code) {
      if (seen.has(candidate.code)) {
        errors.push(`銘柄コード重複: ${candidate.code}`);
      }
      seen.add(candidate.code);
    }
  });

  return errors;
}
