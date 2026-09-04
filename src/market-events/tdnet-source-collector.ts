import { createHash } from "node:crypto";
import { fetchTdnetDisclosures, type TdnetDisclosure } from "../fetcher/jpx.js";
import {
  getSourceCheckpoint,
  upsertSourceCheckpoint,
  type SourceCheckpoint,
} from "./source-checkpoint-store.js";
import type { MarketEventDatabase } from "./sqlite-store.js";

export const TDNET_MARKET_EVENT_SOURCE_KEY = "jpx:tdnet:market-events";

export type TdnetSourceCollectionResult = {
  sourceKey: string;
  status: "changed" | "unchanged" | "failed";
  checkedAt: string;
  contentHash: string | null;
  disclosures: TdnetDisclosure[];
  error: string | null;
};

export type TdnetSourceCollectorOptions = {
  sourceKey?: string;
  fetchDisclosures?: () => Promise<TdnetDisclosure[]>;
  now?: () => string;
};

function canonicalDisclosureRows(disclosures: TdnetDisclosure[]): string[] {
  const rows = disclosures.map(disclosure => JSON.stringify({
    code: disclosure.code,
    companyName: disclosure.companyName,
    title: disclosure.title,
    publishedAt: disclosure.publishedAt,
    url: disclosure.url,
  }));
  return [...new Set(rows)].sort();
}

export function hashTdnetDisclosures(disclosures: TdnetDisclosure[]): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalDisclosureRows(disclosures)))
    .digest("hex");
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const singleLine = raw.replace(/[\r\n\t]+/g, " ").trim();
  return (singleLine || "unknown TDnet fetch error").slice(0, 500);
}

function buildSuccessCheckpoint(
  sourceKey: string,
  checkedAt: string,
  contentHash: string,
): SourceCheckpoint {
  return {
    sourceKey,
    sourceType: "TDNET",
    cursorValue: null,
    etag: null,
    lastModified: null,
    lastContentHash: contentHash,
    lastCheckedAt: checkedAt,
    lastSuccessAt: checkedAt,
    consecutiveFailures: 0,
    nextCheckAt: null,
    lastError: null,
  };
}

function buildFailureCheckpoint(
  sourceKey: string,
  checkedAt: string,
  existing: SourceCheckpoint | null,
  error: string,
): SourceCheckpoint {
  return {
    sourceKey,
    sourceType: existing?.sourceType ?? "TDNET",
    cursorValue: existing?.cursorValue ?? null,
    etag: existing?.etag ?? null,
    lastModified: existing?.lastModified ?? null,
    lastContentHash: existing?.lastContentHash ?? null,
    lastCheckedAt: checkedAt,
    lastSuccessAt: existing?.lastSuccessAt ?? null,
    consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
    nextCheckAt: null,
    lastError: error,
  };
}

export async function collectTdnetSourceOnce(
  db: MarketEventDatabase,
  options: TdnetSourceCollectorOptions = {},
): Promise<TdnetSourceCollectionResult> {
  const sourceKey = options.sourceKey?.trim() || TDNET_MARKET_EVENT_SOURCE_KEY;
  const fetchDisclosures = options.fetchDisclosures ?? fetchTdnetDisclosures;
  const now = options.now ?? (() => new Date().toISOString());
  const existing = getSourceCheckpoint(db, sourceKey);

  try {
    const disclosures = await fetchDisclosures();
    const checkedAt = now();
    const contentHash = hashTdnetDisclosures(disclosures);
    const status = existing?.lastContentHash === contentHash ? "unchanged" : "changed";
    upsertSourceCheckpoint(db, buildSuccessCheckpoint(sourceKey, checkedAt, contentHash));
    return {
      sourceKey,
      status,
      checkedAt,
      contentHash,
      disclosures,
      error: null,
    };
  } catch (error) {
    const checkedAt = now();
    const message = safeErrorMessage(error);
    upsertSourceCheckpoint(db, buildFailureCheckpoint(sourceKey, checkedAt, existing, message));
    return {
      sourceKey,
      status: "failed",
      checkedAt,
      contentHash: existing?.lastContentHash ?? null,
      disclosures: [],
      error: message,
    };
  }
}
