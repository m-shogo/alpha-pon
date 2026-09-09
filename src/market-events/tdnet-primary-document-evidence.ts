import { createHash } from "node:crypto";
import { compareExplicitIso8601Instants, parseExplicitIso8601Instant } from "../research/iso-instant.js";
import {
  assertTdnetMarketEventCandidateIdentity,
  type TdnetMarketEventCandidate,
} from "./tdnet-event-candidates.js";

const DEFAULT_MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const PDF_SIGNATURE = new TextEncoder().encode("%PDF-");
const PDF_EOF_MARKER = new TextEncoder().encode("%%EOF");
const PDF_EOF_TAIL_BYTES = 1024;

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
    parsed.href !== value
    || parsed.origin !== "https://www.release.tdnet.info"
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

function appendPdfTail(current: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (chunk.byteLength >= PDF_EOF_TAIL_BYTES) {
    return chunk.slice(chunk.byteLength - PDF_EOF_TAIL_BYTES);
  }
  const combined = new Uint8Array(Math.min(PDF_EOF_TAIL_BYTES, current.byteLength + chunk.byteLength));
  const currentBytesToKeep = combined.byteLength - chunk.byteLength;
  if (currentBytesToKeep > 0) {
    combined.set(current.subarray(current.byteLength - currentBytesToKeep), 0);
  }
  combined.set(chunk, currentBytesToKeep);
  return combined;
}

function isPdfWhitespace(byte: number): boolean {
  return byte === 0x00
    || byte === 0x09
    || byte === 0x0a
    || byte === 0x0c
    || byte === 0x0d
    || byte === 0x20;
}

function hasCanonicalPdfEofTail(tail: Uint8Array): boolean {
  if (tail.byteLength < PDF_EOF_MARKER.byteLength) return false;

  for (let offset = tail.byteLength - PDF_EOF_MARKER.byteLength; offset >= 0; offset -= 1) {
    let matched = true;
    for (let index = 0; index < PDF_EOF_MARKER.byteLength; index += 1) {
      if (tail[offset + index] !== PDF_EOF_MARKER[index]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    for (let index = offset + PDF_EOF_MARKER.byteLength; index < tail.byteLength; index += 1) {
      if (!isPdfWhitespace(tail[index]!)) return false;
    }
    return true;
  }

  return false;
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
  let pdfTail: Uint8Array = new Uint8Array(0);

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
      pdfTail = appendPdfTail(pdfTail, value);
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
  if (!hasCanonicalPdfEofTail(pdfTail)) {
    throw new Error("TDnet primary document body must end after a PDF EOF marker with whitespace only");
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
  assertTdnetMarketEventCandidateIdentity(candidate);
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

  if (response.status !== 200) {
    throw new Error(`TDnet primary document fetch failed with HTTP ${response.status}; complete evidence requires HTTP 200`);
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
