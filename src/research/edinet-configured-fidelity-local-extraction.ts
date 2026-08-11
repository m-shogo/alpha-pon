import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

export type ConfiguredStructuredTextEntry = {
  path: string;
  text: string;
  textHash: string;
  lineCount: number;
  byteLength: number;
};

export type ConfiguredStructuredTextArchive = {
  schemaVersion: 1;
  source: "edinet";
  docID: string;
  sourceBinarySha256: string;
  generatedAt: string;
  entryCount: number;
  lineCount: number;
  entries: ConfiguredStructuredTextEntry[];
  archiveHash: string;
};

type JsonObject = Record<string, unknown>;

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

function textDigest(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

export function hasZipMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  return bytes[0] === 0x50
    && bytes[1] === 0x4b
    && (
      (bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08)
    );
}

export function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

export function normalizePdfLayoutText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

export function countPdfPages(value: string): number {
  if (!value.trim()) return 0;
  const pages = value.split("\f");
  while (pages.length > 1 && pages.at(-1)!.trim() === "") pages.pop();
  return pages.length;
}

export function countTextLines(value: string): number {
  if (!value) return 0;
  return value.split("\n").length;
}

function assertSafeEntryPath(path: string): void {
  if (
    !path
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some(part => !part || part === "." || part === "..")
  ) {
    throw new Error(`unsafe structured entry path: ${path}`);
  }
}

export function buildConfiguredStructuredTextArchive(input: {
  docID: string;
  sourceBinarySha256: string;
  generatedAt: string;
  entries: Array<{ path: string; text: string }>;
}): ConfiguredStructuredTextArchive {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(input.docID)) throw new Error("docID is invalid");
  if (!/^[a-f0-9]{64}$/.test(input.sourceBinarySha256)) {
    throw new Error("sourceBinarySha256 is invalid");
  }
  parseExplicitIso8601Instant(input.generatedAt, "generatedAt");
  if (input.entries.length === 0) throw new Error("structured entries must not be empty");
  const seen = new Set<string>();
  const entries = input.entries.map(entry => {
    assertSafeEntryPath(entry.path);
    if (seen.has(entry.path)) throw new Error(`duplicate structured entry path: ${entry.path}`);
    seen.add(entry.path);
    if (!entry.text.trim()) throw new Error(`structured entry is empty: ${entry.path}`);
    const normalizedText = entry.text.replace(/\r\n?/g, "\n").trim();
    return {
      path: entry.path,
      text: normalizedText,
      textHash: textDigest(normalizedText),
      lineCount: countTextLines(normalizedText),
      byteLength: Buffer.byteLength(normalizedText, "utf-8"),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    docID: input.docID,
    sourceBinarySha256: input.sourceBinarySha256,
    generatedAt: input.generatedAt,
    entryCount: entries.length,
    lineCount: entries.reduce((sum, entry) => sum + entry.lineCount, 0),
    entries,
  };
  return { ...base, archiveHash: digest(base) };
}
