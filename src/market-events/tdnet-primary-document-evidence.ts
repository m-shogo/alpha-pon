import { createHash } from "node:crypto";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../research/iso-instant.js";
import type { TdnetMarketEventCandidate } from "./tdnet-event-candidates.js";

const DEFAULT_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type TdnetPrimaryDocumentEvidence = {
  candidateId: string;
  sourceUrl: string;
  retrievedAt: string;
  contentHash: string;
  byteLength: number;
  contentType: string;
};

export type AcquireTdnetPrimaryDocumentEvidenceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => string;
  maxBytes?: number;
};

function assertOfficialTdnetDocumentUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an official TDnet document URL`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "www.release.tdnet.info"
    || !parsed.pathname.startsWith("/inbs/")
    || !parsed.pathname.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error(`${label} must be an official TDnet document URL`);
  }
  return parsed;
}

function parsePositiveMaxBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("TDnet primary document maxBytes must be a positive safe integer");
  }
  return value;
}

export async function acquireTdnetPrimaryDocumentEvidence(
  candidate: TdnetMarketEventCandidate,
  options: AcquireTdnetPrimaryDocumentEvidenceOptions = {},
): Promise<TdnetPrimaryDocumentEvidence> {
  const requestedUrl = assertOfficialTdnetDocumentUrl(candidate.sourceUrl, "TDnet primary document sourceUrl");
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const maxBytes = parsePositiveMaxBytes(options.maxBytes ?? DEFAULT_MAX_DOCUMENT_BYTES);

  const response = await fetchImpl(requestedUrl.href, {
    method: "GET",
    redirect: "follow",
    headers: {
      accept: "application/pdf",
    },
  });

  if (!response.ok) {
    throw new Error(`TDnet primary document fetch failed with HTTP ${response.status}`);
  }

  const finalUrl = assertOfficialTdnetDocumentUrl(response.url, "TDnet primary document final URL");
  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (contentType !== "application/pdf") {
    throw new Error(`TDnet primary document must be application/pdf, got ${contentType || "missing content-type"}`);
  }

  const declaredLengthRaw = response.headers.get("content-length");
  if (declaredLengthRaw !== null) {
    const declaredLength = Number(declaredLengthRaw);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new Error("TDnet primary document content-length must be a non-negative safe integer");
    }
    if (declaredLength > maxBytes) {
      throw new Error(`TDnet primary document exceeds maxBytes (${declaredLength} > ${maxBytes})`);
    }
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("TDnet primary document body must not be empty");
  }
  if (bytes.byteLength > maxBytes) {
    throw new Error(`TDnet primary document exceeds maxBytes (${bytes.byteLength} > ${maxBytes})`);
  }

  const retrievedAt = now();
  parseExplicitIso8601Instant(retrievedAt, "TDnet primary document retrievedAt");
  if (
    compareExplicitIso8601Instants(
      retrievedAt,
      candidate.disclosurePublishedAt,
      "TDnet primary document retrievedAt",
      "TDnet disclosurePublishedAt",
    ) < 0
  ) {
    throw new Error("TDnet primary document retrievedAt must not precede disclosurePublishedAt");
  }

  return {
    candidateId: candidate.candidateId,
    sourceUrl: finalUrl.href,
    retrievedAt,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
    contentType,
  };
}
