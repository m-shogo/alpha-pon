import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const ISSUER_KEY_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const EDINET_CODE_RE = /^E\d{5}$/;
const SECURITY_CODE_RE = /^\d{5}$/;
const DOCUMENT_TYPE_RE = /^[1-5]$/;
const HASH_RE = /^[a-f0-9]{64}$/;

type JsonObject = Record<string, unknown>;

export type EdinetIssuerStoragePolicy = "local_only" | "metadata_only_git";
export type EdinetIssuerFactPromotionPolicy = "human_review_required";

export type EdinetIssuerBoundary = {
  issuerKey: string;
  name: string;
  edinetCode: string;
  secCode: string;
  aliases: string[];
  active: boolean;
  allowedDocumentTypes: string[];
  storagePolicy: EdinetIssuerStoragePolicy;
  factPromotionPolicy: EdinetIssuerFactPromotionPolicy;
  requireOfficialPdfVisualReview: boolean;
  boundaryHash: string;
};

export type EdinetIssuerRegistry = {
  schemaVersion: 1;
  registryId: "edinet-issuer-boundary-v1";
  generatedAt: string;
  issuerCount: number;
  issuers: EdinetIssuerBoundary[];
  registryHash: string;
};

export type EdinetIssuerIdentityInput = {
  name?: unknown;
  edinetCode?: unknown;
  secCode?: unknown;
  issuerKey?: unknown;
};

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = str(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function normalizedAlias(value: string): string {
  return value.normalize("NFKC").replace(/[\s\u00a0]+/g, "").toLowerCase();
}

function parseAliases(value: unknown, field: string, name: string): string[] {
  const aliases = arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
  const deduped = new Map<string, string>();
  for (const alias of [name, ...aliases]) {
    const key = normalizedAlias(alias);
    if (!key) throw new Error(`${field} contains an empty normalized alias`);
    const existing = deduped.get(key);
    if (existing && existing !== alias) {
      throw new Error(`${field} contains equivalent duplicate aliases: ${existing} / ${alias}`);
    }
    deduped.set(key, alias);
  }
  return [...deduped.values()].sort((left, right) => left.localeCompare(right, "ja"));
}

function parseDocumentTypes(value: unknown, field: string): string[] {
  const types = arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
  if (types.length === 0) throw new Error(`${field} must not be empty`);
  for (const type of types) {
    if (!DOCUMENT_TYPE_RE.test(type)) throw new Error(`${field} contains unsupported document type ${type}`);
  }
  if (new Set(types).size !== types.length) throw new Error(`${field} contains duplicates`);
  return [...types].sort();
}

function boundaryHashPayload(boundary: Omit<EdinetIssuerBoundary, "boundaryHash">): unknown {
  return boundary;
}

function parseBoundary(value: unknown, field: string): EdinetIssuerBoundary {
  const record = obj(value, field);
  const issuerKey = required(record.issuerKey, `${field}.issuerKey`);
  if (!ISSUER_KEY_RE.test(issuerKey)) throw new Error(`${field}.issuerKey is invalid`);
  const name = required(record.name, `${field}.name`);
  const edinetCode = required(record.edinetCode, `${field}.edinetCode`).toUpperCase();
  if (!EDINET_CODE_RE.test(edinetCode)) throw new Error(`${field}.edinetCode is invalid`);
  const secCode = required(record.secCode, `${field}.secCode`);
  if (!SECURITY_CODE_RE.test(secCode)) throw new Error(`${field}.secCode is invalid`);
  if (typeof record.active !== "boolean") throw new Error(`${field}.active must be boolean`);
  const storagePolicy = required(record.storagePolicy, `${field}.storagePolicy`);
  if (storagePolicy !== "local_only" && storagePolicy !== "metadata_only_git") {
    throw new Error(`${field}.storagePolicy is unsupported`);
  }
  const factPromotionPolicy = required(record.factPromotionPolicy, `${field}.factPromotionPolicy`);
  if (factPromotionPolicy !== "human_review_required") {
    throw new Error(`${field}.factPromotionPolicy must be human_review_required`);
  }
  if (record.requireOfficialPdfVisualReview !== true) {
    throw new Error(`${field}.requireOfficialPdfVisualReview must be true`);
  }
  const base: Omit<EdinetIssuerBoundary, "boundaryHash"> = {
    issuerKey,
    name,
    edinetCode,
    secCode,
    aliases: parseAliases(record.aliases, `${field}.aliases`, name),
    active: record.active,
    allowedDocumentTypes: parseDocumentTypes(record.allowedDocumentTypes, `${field}.allowedDocumentTypes`),
    storagePolicy,
    factPromotionPolicy: "human_review_required",
    requireOfficialPdfVisualReview: true,
  };
  const expectedHash = str(record.boundaryHash);
  const actualHash = digest(boundaryHashPayload(base));
  if (expectedHash) {
    if (!HASH_RE.test(expectedHash)) throw new Error(`${field}.boundaryHash is invalid`);
    if (expectedHash !== actualHash) throw new Error(`${field}.boundaryHash mismatch`);
  }
  return { ...base, boundaryHash: actualHash };
}

function registryHashPayload(input: {
  schemaVersion: 1;
  registryId: "edinet-issuer-boundary-v1";
  issuers: EdinetIssuerBoundary[];
}): unknown {
  return input;
}

export function buildEdinetIssuerRegistry(input: unknown): EdinetIssuerRegistry {
  const record = obj(input, "issuerRegistry");
  if (record.schemaVersion !== 1 || record.registryId !== "edinet-issuer-boundary-v1") {
    throw new Error("issuerRegistry schemaVersion/registryId is unsupported");
  }
  const generatedAt = timestamp(record.generatedAt, "issuerRegistry.generatedAt");
  const issuers = arr(record.issuers, "issuerRegistry.issuers")
    .map((issuer, index) => parseBoundary(issuer, `issuerRegistry.issuers[${index}]`))
    .sort((left, right) => left.issuerKey.localeCompare(right.issuerKey));
  if (issuers.length === 0) throw new Error("issuerRegistry.issuers must not be empty");

  const issuerKeys = new Set<string>();
  const edinetCodes = new Set<string>();
  const secCodes = new Set<string>();
  const aliases = new Map<string, string>();
  for (const issuer of issuers) {
    if (issuerKeys.has(issuer.issuerKey)) throw new Error(`duplicate issuerKey ${issuer.issuerKey}`);
    if (edinetCodes.has(issuer.edinetCode)) throw new Error(`duplicate edinetCode ${issuer.edinetCode}`);
    if (secCodes.has(issuer.secCode)) throw new Error(`duplicate secCode ${issuer.secCode}`);
    issuerKeys.add(issuer.issuerKey);
    edinetCodes.add(issuer.edinetCode);
    secCodes.add(issuer.secCode);
    for (const alias of issuer.aliases) {
      const key = normalizedAlias(alias);
      const existing = aliases.get(key);
      if (existing && existing !== issuer.issuerKey) {
        throw new Error(`alias ${alias} is ambiguous between ${existing} and ${issuer.issuerKey}`);
      }
      aliases.set(key, issuer.issuerKey);
    }
  }
  const expectedCount = Number(record.issuerCount);
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== issuers.length) {
    throw new Error("issuerRegistry.issuerCount mismatch");
  }
  const hashBase = {
    schemaVersion: 1 as const,
    registryId: "edinet-issuer-boundary-v1" as const,
    issuers,
  };
  const registryHash = digest(registryHashPayload(hashBase));
  const expectedHash = str(record.registryHash);
  if (expectedHash) {
    if (!HASH_RE.test(expectedHash)) throw new Error("issuerRegistry.registryHash is invalid");
    if (expectedHash !== registryHash) throw new Error("issuerRegistry.registryHash mismatch");
  }
  return {
    ...hashBase,
    generatedAt,
    issuerCount: issuers.length,
    registryHash,
  };
}

export function resolveEdinetIssuerBoundary(
  registry: EdinetIssuerRegistry,
  identifier: string,
  options: { requireActive?: boolean } = {},
): EdinetIssuerBoundary {
  const query = identifier.trim();
  if (!query) throw new Error("issuer identifier is required");
  const normalized = normalizedAlias(query);
  const matches = registry.issuers.filter(issuer =>
    issuer.issuerKey === query
    || issuer.edinetCode === query.toUpperCase()
    || issuer.secCode === query
    || issuer.aliases.some(alias => normalizedAlias(alias) === normalized),
  );
  if (matches.length === 0) throw new Error(`issuer is not configured: ${identifier}`);
  if (matches.length > 1) throw new Error(`issuer identifier is ambiguous: ${identifier}`);
  const issuer = matches[0]!;
  if ((options.requireActive ?? true) && !issuer.active) {
    throw new Error(`issuer is inactive: ${issuer.issuerKey}`);
  }
  return issuer;
}

export function assertEdinetIssuerIdentity(
  boundary: EdinetIssuerBoundary,
  input: EdinetIssuerIdentityInput,
  field = "issuer",
): void {
  const edinetCode = str(input.edinetCode).toUpperCase();
  const secCode = str(input.secCode);
  const issuerKey = str(input.issuerKey);
  const name = str(input.name);
  if (edinetCode && edinetCode !== boundary.edinetCode) {
    throw new Error(`${field}.edinetCode does not match configured issuer`);
  }
  if (secCode && secCode !== boundary.secCode) {
    throw new Error(`${field}.secCode does not match configured issuer`);
  }
  if (issuerKey && issuerKey !== boundary.issuerKey) {
    throw new Error(`${field}.issuerKey does not match configured issuer`);
  }
  if (name) {
    const normalized = normalizedAlias(name);
    if (!boundary.aliases.some(alias => normalizedAlias(alias) === normalized)) {
      throw new Error(`${field}.name is not a configured alias`);
    }
  }
  if (!edinetCode && !secCode && !issuerKey && !name) {
    throw new Error(`${field} has no identity field`);
  }
}

export function assertEdinetDocumentTypeAllowed(
  boundary: EdinetIssuerBoundary,
  documentType: string,
): void {
  if (!DOCUMENT_TYPE_RE.test(documentType)) throw new Error(`invalid EDINET document type ${documentType}`);
  if (!boundary.allowedDocumentTypes.includes(documentType)) {
    throw new Error(`document type ${documentType} is not allowed for ${boundary.issuerKey}`);
  }
}

export function buildIssuerBoundaryEvidence(boundary: EdinetIssuerBoundary): {
  issuerKey: string;
  edinetCode: string;
  secCode: string;
  boundaryHash: string;
  active: boolean;
  factPromotionPolicy: EdinetIssuerFactPromotionPolicy;
  requireOfficialPdfVisualReview: true;
} {
  return {
    issuerKey: boundary.issuerKey,
    edinetCode: boundary.edinetCode,
    secCode: boundary.secCode,
    boundaryHash: boundary.boundaryHash,
    active: boundary.active,
    factPromotionPolicy: boundary.factPromotionPolicy,
    requireOfficialPdfVisualReview: true,
  };
}
