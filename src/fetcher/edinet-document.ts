import { createHash } from "node:crypto";
import {
  EDINET_API_BASE_URL,
  EDINET_API_KEY_ENV,
  EdinetApiError,
  EdinetCredentialsMissingError,
  type EdinetClientOptions,
} from "./edinet.js";

export type EdinetDocumentTypeCode = "1" | "2" | "3" | "4" | "5";

export type EdinetDocumentClientOptions = EdinetClientOptions & {
  maxBytes?: number;
  now?: () => Date;
};

export type EdinetDownloadedDocument = {
  docID: string;
  documentType: EdinetDocumentTypeCode;
  bytes: Uint8Array;
  byteLength: number;
  sha256: string;
  contentType: string | null;
  contentDisposition: string | null;
  retrievedAt: string;
  sourceEndpoint: string;
};

export class EdinetDocumentTooLargeError extends Error {
  readonly code = "edinet_document_too_large";
  readonly source = "edinet";
  readonly limitBytes: number;
  readonly actualBytes: number;

  constructor(limitBytes: number, actualBytes: number) {
    super(`EDINET document exceeds local size limit (${actualBytes} > ${limitBytes})`);
    this.name = "EdinetDocumentTooLargeError";
    this.limitBytes = limitBytes;
    this.actualBytes = actualBytes;
  }
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const API_KEY_QUERY_PARAM = "Subscription-Key";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function validateDocID(docID: string): void {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(docID)) {
    throw new Error("EDINET docID contains unsupported characters");
  }
}

function validateDocumentType(type: string): asserts type is EdinetDocumentTypeCode {
  if (!/^[1-5]$/.test(type)) {
    throw new Error("EDINET document type must be one of 1, 2, 3, 4, 5");
  }
}

function resolveApiKey(options: EdinetDocumentClientOptions): string {
  const value = options.apiKey ?? process.env[EDINET_API_KEY_ENV];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EdinetCredentialsMissingError();
  }
  return value.trim();
}

function buildRequestUrl(
  docID: string,
  documentType: EdinetDocumentTypeCode,
  apiKey: string,
  baseUrl: string,
): URL {
  const url = new URL(
    `${normalizeBaseUrl(baseUrl)}/documents/${encodeURIComponent(docID)}`,
  );
  url.searchParams.set("type", documentType);
  url.searchParams.set(API_KEY_QUERY_PARAM, apiKey);
  return url;
}

function buildSourceEndpoint(
  docID: string,
  documentType: EdinetDocumentTypeCode,
  baseUrl: string,
): string {
  const url = new URL(
    `${normalizeBaseUrl(baseUrl)}/documents/${encodeURIComponent(docID)}`,
  );
  url.searchParams.set("type", documentType);
  return url.toString();
}

function retryDelayMs(response: Response, attempt: number, baseMs: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return baseMs * attempt;
}

function parseContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function readResponseWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new EdinetDocumentTooLargeError(maxBytes, bytes.byteLength);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("EDINET document exceeds local size limit");
        throw new EdinetDocumentTooLargeError(maxBytes, totalBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchEdinetDocument(
  docID: string,
  documentTypeInput: string,
  options: EdinetDocumentClientOptions = {},
): Promise<EdinetDownloadedDocument> {
  validateDocID(docID);
  validateDocumentType(documentTypeInput);

  const documentType = documentTypeInput;
  const apiKey = resolveApiKey(options);
  const baseUrl = options.baseUrl ?? EDINET_API_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryBaseMs = Math.max(0, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  const requestUrl = buildRequestUrl(docID, documentType, apiKey, baseUrl);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(requestUrl, {
        headers: { accept: "application/octet-stream" },
      });
    } catch {
      if (attempt >= maxAttempts) throw new EdinetApiError(0, true);
      await sleep(retryBaseMs * attempt);
      continue;
    }

    if (!response.ok) {
      const retryable = RETRYABLE_STATUS_CODES.has(response.status);
      if (!retryable || attempt >= maxAttempts) {
        throw new EdinetApiError(response.status, retryable);
      }
      await sleep(retryDelayMs(response, attempt, retryBaseMs));
      continue;
    }

    const announcedLength = parseContentLength(response);
    if (announcedLength !== null && announcedLength > maxBytes) {
      await response.body?.cancel("EDINET document exceeds announced size limit");
      throw new EdinetDocumentTooLargeError(maxBytes, announcedLength);
    }

    const bytes = await readResponseWithinLimit(response, maxBytes);
    return {
      docID,
      documentType,
      bytes,
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: response.headers.get("content-type"),
      contentDisposition: response.headers.get("content-disposition"),
      retrievedAt: now().toISOString(),
      sourceEndpoint: buildSourceEndpoint(docID, documentType, baseUrl),
    };
  }

  throw new EdinetApiError(0, true);
}
