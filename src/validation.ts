import { isValidDate } from "./research/schema.js";
import type { WatchlistConfig, Market, Priority, CandidateStatus } from "./types.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateCandidate(candidate: unknown, index: number): string[] {
  if (!isRecord(candidate)) {
    return [`symbols[${index}]: 銘柄rowはobjectにしてください`];
  }

  const errors: string[] = [];
  const label = isNonEmptyString(candidate.code) && isNonEmptyString(candidate.name)
    ? `${candidate.code} ${candidate.name}`
    : `symbols[${index}]`;

  if (!isNonEmptyString(candidate.code)) {
    errors.push(`${label}: code が空です`);
  } else if (candidate.code !== candidate.code.trim()) {
    errors.push(`${label}: code は前後空白なしのcanonical identityにしてください`);
  }

  if (!isNonEmptyString(candidate.name)) {
    errors.push(`${label}: name が空です`);
  }

  if (!VALID_MARKETS.has(candidate.market as Market)) {
    errors.push(`${label}: market が不正です (${String(candidate.market)})`);
  }

  if (!VALID_PRIORITIES.has(candidate.priority as Priority)) {
    errors.push(`${label}: priority が不正です (${String(candidate.priority)})`);
  }

  if (!VALID_STATUSES.has(candidate.status as CandidateStatus)) {
    errors.push(`${label}: status が不正です (${String(candidate.status)})`);
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

  if (candidate.listedAt !== undefined && (
    typeof candidate.listedAt !== "string" || !isValidDate(candidate.listedAt)
  )) {
    errors.push(`${label}: listedAt は YYYY-MM-DD 形式の実在する日付にしてください`);
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

    if (isRecord(candidate) && isNonEmptyString(candidate.code)) {
      const canonicalCode = candidate.code.trim();
      if (seen.has(canonicalCode)) {
        errors.push(`銘柄コード重複: ${canonicalCode}`);
      }
      seen.add(canonicalCode);
    }
  });

  return errors;
}
