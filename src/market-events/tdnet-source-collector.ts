import { createHash } from "node:crypto";
import {
  fetchTdnetDisclosureSnapshot,
  type TdnetDisclosure,
  type TdnetDisclosureSnapshot,
} from "../fetcher/jpx.js";
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
  explicitEmpty: boolean;
  error: string | null;
};

export type TdnetSourceCollectorOptions = {
  sourceKey?: string;
  observationDate?: string;
  /** Preferred richer boundary used by the official public viewer source. */
  fetchSnapshot?: () => Promise<Pick<TdnetDisclosureSnapshot, "disclosures" | "explicitEmpty">>;
  /** Backward-compatible injection for tests/callers that do not know explicit-empty semantics. */
  fetchDisclosures?: () => Promise<TdnetDisclosure[]>;
  now?: () => string;
};

function canonicalDisclosureRows(disclosures: TdnetDisclosure[]): string[] {
  const rows = disclosures.map(disclosure => JSON.stringify({
    code: disclosure.code,
    sourceCode: disclosure.sourceCode ?? null,
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
  existing: SourceCheckpoint | null,
): SourceCheckpoint {
  return {
    sourceKey,
    sourceType: "TDNET",
    cursorValue: existing?.cursorValue ?? null,
    etag: existing?.etag ?? null,
    lastModified: existing?.lastModified ?? null,
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

function recordFailure(
  db: MarketEventDatabase,
  sourceKey: string,
  checkedAt: string,
  existing: SourceCheckpoint | null,
  error: unknown,
): TdnetSourceCollectionResult {
  const message = safeErrorMessage(error);
  upsertSourceCheckpoint(db, buildFailureCheckpoint(sourceKey, checkedAt, existing, message));
  return {
    sourceKey,
    status: "failed",
    checkedAt,
    contentHash: existing?.lastContentHash ?? null,
    disclosures: [],
    explicitEmpty: false,
    error: message,
  };
}

async function fetchSourceSnapshot(
  options: TdnetSourceCollectorOptions,
): Promise<Pick<TdnetDisclosureSnapshot, "disclosures" | "explicitEmpty">> {
  if (options.fetchSnapshot && options.fetchDisclosures) {
    throw new Error("TDnet collector accepts either fetchSnapshot or fetchDisclosures, not both");
  }
  if (options.fetchSnapshot) return options.fetchSnapshot();
  if (options.fetchDisclosures) {
    return {
      disclosures: await options.fetchDisclosures(),
      // Legacy/injected arrays cannot prove that zero rows were explicitly reported by TDnet.
      explicitEmpty: false,
    };
  }
  return fetchTdnetDisclosureSnapshot({ observationDate: options.observationDate });
}

export async function collectTdnetSourceOnce(
  db: MarketEventDatabase,
  options: TdnetSourceCollectorOptions = {},
): Promise<TdnetSourceCollectionResult> {
  const sourceKey = options.sourceKey?.trim() || TDNET_MARKET_EVENT_SOURCE_KEY;
  const now = options.now ?? (() => new Date().toISOString());
  const existing = getSourceCheckpoint(db, sourceKey);

  let snapshot: Pick<TdnetDisclosureSnapshot, "disclosures" | "explicitEmpty">;
  try {
    snapshot = await fetchSourceSnapshot(options);
  } catch (error) {
    return recordFailure(db, sourceKey, now(), existing, error);
  }

  const checkedAt = now();
  if (snapshot.explicitEmpty && snapshot.disclosures.length > 0) {
    return recordFailure(
      db,
      sourceKey,
      checkedAt,
      existing,
      new Error("TDnet snapshot cannot be explicit-empty while containing disclosures"),
    );
  }
  if (snapshot.disclosures.length === 0 && !snapshot.explicitEmpty) {
    return recordFailure(
      db,
      sourceKey,
      checkedAt,
      existing,
      new Error("TDnet disclosure fetch returned zero rows"),
    );
  }

  const contentHash = hashTdnetDisclosures(snapshot.disclosures);
  const status = existing?.lastContentHash === contentHash ? "unchanged" : "changed";
  upsertSourceCheckpoint(db, buildSuccessCheckpoint(sourceKey, checkedAt, contentHash, existing));
  return {
    sourceKey,
    status,
    checkedAt,
    contentHash,
    disclosures: snapshot.disclosures,
    explicitEmpty: snapshot.explicitEmpty,
    error: null,
  };
}
