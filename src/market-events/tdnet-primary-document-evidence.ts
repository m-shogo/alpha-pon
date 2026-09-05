import { createHash } from "node:crypto";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../research/iso-instant.js";
import type { TdnetMarketEventCandidate } from "./tdnet-event-candidates.js";

const DEFAULT_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const PDF_SIGNATURE = new TextEncoder().encode("%PDF-");

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
    parsed.origin !== "https://www.release.tdnet.info"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
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

function parseDeclaredContentLength(value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("TDnet primary document content-length must contain decimal digits only");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("TDnet primary document content-length must be a non-negative safe integer");
  }
  return parsed;
}

async function readPrimaryDocumentBody(response: Response, maxBytes: number): Promise<{
  byteLength: number;
  contentHash: string;
}> {
  if (response.body === null) {
    throw new Error("TDnet primary document response body must be stream-readable");
  }

  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let byteLength = 0;
  let signatureOffset = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new Error(`TDnet primary document exceeds maxBytes (${byteLength} > ${maxBytes})`);
      }

      for (const byte of value) {
        if (signatureOffset >= PDF_SIGNATURE.byteLength) break;
        if (byte !== PDF_SIGNATURE[signatureOffset]) {
          await reader.cancel();
          throw new Error("TDnet primary document body must have a PDF signature");
        }
        signatureOffset += 1;
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (byteLength === 0) {
    throw new Error("TDnet primary document body must not be empty");
  }
  if (signatureOffset < PDF_SIGNATURE.byteLength) {
    throw new Error("TDnet primary document body must have a PDF signature");
  }

  return {
    byteLength,
    contentHash: hash.digest("hex"),
  };
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
    redirect: "error",
    headers: {
      accept: "application/pdf",
    },
  });

  if (!response.ok) {
    throw new Error(`TDnet primary document fetch failed with HTTP ${response.status}`);
  }

  const finalUrl = assertOfficialTdnetDocumentUrl(response.url, "TDnet primary document final URL");
  if (finalUrl.href !== requestedUrl.href) {
    throw new Error("TDnet primary document final URL must match requested sourceUrl");
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (contentType !== "application/pdf") {
    throw new Error(`TDnet primary document must be application/pdf, got ${contentType || "missing content-type"}`);
  }

  const declaredLengthRaw = response.headers.get("content-length");
  let declaredLength: number | null = null;
  if (declaredLengthRaw !== null) {
    declaredLength = parseDeclaredContentLength(declaredLengthRaw);
    if (declaredLength > maxBytes) {
      throw new Error(`TDnet primary document exceeds maxBytes (${declaredLength} > ${maxBytes})`);
    }
  }

  const body = await readPrimaryDocumentBody(response, maxBytes);
  if (declaredLength !== null && declaredLength !== body.byteLength) {
    throw new Error(`TDnet primary document content-length mismatch (${declaredLength} !== ${body.byteLength})`);
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
    contentHash: body.contentHash,
    byteLength: body.byteLength,
    contentType,
  };
}
