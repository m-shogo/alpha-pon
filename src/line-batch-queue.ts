// LINE通知バッチの永続キュー + 配信台帳（ledger）。
// enqueue時点では delivered 扱いにせず、実LINE送信成功時だけ sent にする。
// fragment envelopeを先にatomic保存し、ledger破損時は空で上書きせずblockする。

import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { detectSection, parseFragmentText, redactSecrets } from "./line-consolidation.js";

export const MAX_ATTEMPTS = 5;
const LEDGER_FILE = ".ledger.json";
const BLOCKED_FILE = ".ledger-blocked.json";
const FRAGMENTS_DIR = "fragments";
const OTHER_SECTION = "📋 その他";
const HASH_PATTERN = /^[0-9a-f]{16}$/;
const JST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type FragmentStatus = "queued" | "sent" | "pending-retry" | "failed" | "skipped";
export type FragmentKind = "normal" | "urgent";

export type FragmentEnvelopeV1 = {
  version: 1;
  hash: string;
  kind: FragmentKind;
  section: string;
  text: string;
  queuedAt: string;
};

export type BlockMarker = {
  reason: "ledger-corrupt";
  detectedAt: string;
  corruptBackupPath?: string;
};

export type LedgerStateStatus = "ok" | "corrupt" | "blocked";

export type LedgerEntry = {
  hash: string;
  section: string;
  kind: FragmentKind;
  status: FragmentStatus;
  attempts: number;
  queuedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  deliveredAt?: string;
  deliveredDateJst?: string;
};

export type Ledger = {
  version: 1;
  entries: Record<string, LedgerEntry>;
};

export function emptyLedger(): Ledger {
  return { version: 1, entries: {} };
}

export function jstDateOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function ensureEntry(
  ledger: Ledger,
  input: { hash: string; section: string; kind: FragmentKind; now: string },
): { ledger: Ledger; action: "added" | "exists" | "already-delivered" } {
  const existing = ledger.entries[input.hash];
  if (existing) {
    if (existing.status === "sent") return { ledger, action: "already-delivered" };
    return { ledger, action: "exists" };
  }
  ledger.entries[input.hash] = {
    hash: input.hash,
    section: input.section,
    kind: input.kind,
    status: "queued",
    attempts: 0,
    queuedAt: input.now,
  };
  return { ledger, action: "added" };
}

export function markSent(ledger: Ledger, hashes: string[], now: string): Ledger {
  for (const h of hashes) {
    const e = ledger.entries[h];
    if (!e) continue;
    e.status = "sent";
    e.deliveredAt = now;
    e.deliveredDateJst = jstDateOf(now);
    e.attempts += 1;
    e.lastAttemptAt = now;
    delete e.lastError;
  }
  return ledger;
}

export function markSkipped(ledger: Ledger, hashes: string[], now: string): Ledger {
  for (const h of hashes) {
    const e = ledger.entries[h];
    if (!e || e.status === "sent") continue;
    e.status = "skipped";
    e.lastAttemptAt = now;
  }
  return ledger;
}

export function markFailed(
  ledger: Ledger,
  hashes: string[],
  error: string,
  now: string,
  maxAttempts = MAX_ATTEMPTS,
): Ledger {
  for (const h of hashes) {
    const e = ledger.entries[h];
    if (!e || e.status === "sent") continue;
    e.attempts += 1;
    e.lastAttemptAt = now;
    e.lastError = error.slice(0, 300);
    e.status = e.attempts >= maxAttempts ? "failed" : "pending-retry";
  }
  return ledger;
}

export function pendingHashes(ledger: Ledger, kind?: FragmentKind): string[] {
  return Object.values(ledger.entries)
    .filter((e) => (kind ? e.kind === kind : true))
    .filter((e) => e.status === "queued" || e.status === "pending-retry")
    .map((e) => e.hash)
    .sort();
}

export function isDelivered(ledger: Ledger, hash: string): boolean {
  return ledger.entries[hash]?.status === "sent";
}

export function countUrgentDeliveredToday(ledger: Ledger, todayJstDate: string): number {
  return Object.values(ledger.entries).filter((e) => {
    if (e.kind !== "urgent" || e.status !== "sent") return false;
    const dateJst = e.deliveredDateJst ?? (e.deliveredAt ? jstDateOf(e.deliveredAt) : undefined);
    return dateJst === todayJstDate;
  }).length;
}

export function pruneLedger(ledger: Ledger, olderThanIso: string): { ledger: Ledger; removed: string[] } {
  const removed: string[] = [];
  for (const [h, e] of Object.entries(ledger.entries)) {
    if ((e.status === "sent" || e.status === "skipped") && (e.deliveredAt ?? e.lastAttemptAt ?? e.queuedAt) < olderThanIso) {
      removed.push(h);
      delete ledger.entries[h];
    }
  }
  return { ledger, removed };
}

export function requeueFailed(ledger: Ledger): { ledger: Ledger; requeued: string[] } {
  const requeued: string[] = [];
  for (const e of Object.values(ledger.entries)) {
    if (e.status === "failed") {
      e.status = "queued";
      e.attempts = 0;
      delete e.lastError;
      requeued.push(e.hash);
    }
  }
  return { ledger, requeued: requeued.sort() };
}

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, path);
}

function fragmentsPath(dir: string): string {
  return join(dir, FRAGMENTS_DIR);
}

function envelopePath(dir: string, hash: string): string {
  return join(fragmentsPath(dir), `${hash}.fragment.json`);
}

export function writeEnvelope(dir: string, env: FragmentEnvelopeV1): void {
  mkdirSync(fragmentsPath(dir), { recursive: true });
  atomicWrite(envelopePath(dir, env.hash), JSON.stringify(env, null, 2));
}

export function readEnvelope(dir: string, hash: string): FragmentEnvelopeV1 | null {
  const path = envelopePath(dir, hash);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
  const e = parsed as Partial<FragmentEnvelopeV1>;
  if (!e || e.version !== 1) return null;
  if (typeof e.hash !== "string" || typeof e.text !== "string") return null;
  if (e.kind !== "normal" && e.kind !== "urgent") return null;
  if (typeof e.section !== "string" || e.section.length === 0) return null;
  if (typeof e.queuedAt !== "string" || Number.isNaN(Date.parse(e.queuedAt))) return null;
  if (e.hash !== hash || !HASH_PATTERN.test(hash)) return null;
  if (contentHash(e.text) !== e.hash) return null;
  return e as FragmentEnvelopeV1;
}

export function listEnvelopeHashes(dir: string): string[] {
  const fp = fragmentsPath(dir);
  if (!existsSync(fp)) return [];
  return readdirSync(fp)
    .filter((f) => f.endsWith(".fragment.json") && !f.includes(".tmp-"))
    .map((f) => f.replace(/\.fragment\.json$/, ""))
    .sort();
}

export function deleteFragmentByHash(dir: string, hash: string): void {
  const ep = envelopePath(dir, hash);
  if (existsSync(ep)) rmSync(ep, { force: true });
  const tp = join(dir, `${hash}.txt`);
  if (existsSync(tp)) rmSync(tp, { force: true });
}

function listLegacyTxtHashes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt") && !f.includes(".tmp-"))
    .map((f) => f.replace(/\.txt$/, ""))
    .sort();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isOptionalIsoTimestamp(value: unknown): value is string | undefined {
  return value === undefined || isIsoTimestamp(value);
}

function isValidLedgerEntry(key: string, value: unknown): value is LedgerEntry {
  if (!HASH_PATTERN.test(key) || !isPlainObject(value)) return false;
  if (value.hash !== key) return false;
  if (typeof value.section !== "string" || value.section.length === 0) return false;
  if (value.kind !== "normal" && value.kind !== "urgent") return false;
  if (!["queued", "sent", "pending-retry", "failed", "skipped"].includes(String(value.status))) return false;
  if (!Number.isInteger(value.attempts) || Number(value.attempts) < 0) return false;
  if (!isIsoTimestamp(value.queuedAt)) return false;
  if (!isOptionalIsoTimestamp(value.lastAttemptAt)) return false;
  if (!isOptionalIsoTimestamp(value.deliveredAt)) return false;
  if (value.lastError !== undefined && typeof value.lastError !== "string") return false;
  if (value.deliveredDateJst !== undefined && (typeof value.deliveredDateJst !== "string" || !JST_DATE_PATTERN.test(value.deliveredDateJst))) return false;
  return true;
}

function parseLedger(raw: string): Ledger | null {
  const parsed: unknown = JSON.parse(raw);
  if (!isPlainObject(parsed) || parsed.version !== 1 || !isPlainObject(parsed.entries)) return null;

  const entries: Record<string, LedgerEntry> = {};
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (!isValidLedgerEntry(key, value)) return null;
    entries[key] = value;
  }
  return { version: 1, entries };
}

export function readBlockMarker(dir: string): BlockMarker | null {
  const path = join(dir, BLOCKED_FILE);
  if (!existsSync(path)) return null;
  try {
    const m = JSON.parse(readFileSync(path, "utf-8")) as BlockMarker;
    if (m && m.reason === "ledger-corrupt") return m;
  } catch {
    // 壊れたmarkerもblocked扱い。
  }
  return { reason: "ledger-corrupt", detectedAt: "unknown" };
}

export function isBlocked(dir: string): boolean {
  return existsSync(join(dir, BLOCKED_FILE));
}

export function blockOnCorrupt(dir: string, now: string): BlockMarker {
  const existing = readBlockMarker(dir);
  if (isBlocked(dir) && existing && existing.detectedAt !== "unknown") return existing;

  let corruptBackupPath: string | undefined;
  const ledgerFile = join(dir, LEDGER_FILE);
  if (existsSync(ledgerFile)) {
    const backup = join(dir, `${LEDGER_FILE}.corrupt-${Date.now()}`);
    try {
      renameSync(ledgerFile, backup);
      corruptBackupPath = backup;
    } catch {
      // 退避失敗でも送信停止markerは残す。
    }
  }
  const marker: BlockMarker = { reason: "ledger-corrupt", detectedAt: now, corruptBackupPath };
  atomicWrite(join(dir, BLOCKED_FILE), JSON.stringify(marker, null, 2));
  return marker;
}

export function clearBlockMarker(dir: string): void {
  const path = join(dir, BLOCKED_FILE);
  if (existsSync(path)) rmSync(path, { force: true });
}

export function readLedgerState(
  dir: string,
): { status: LedgerStateStatus; ledger: Ledger; marker?: BlockMarker } {
  if (isBlocked(dir)) {
    return { status: "blocked", ledger: emptyLedger(), marker: readBlockMarker(dir) ?? undefined };
  }
  const path = join(dir, LEDGER_FILE);
  if (!existsSync(path)) return { status: "ok", ledger: emptyLedger() };
  try {
    const parsed = parseLedger(readFileSync(path, "utf-8"));
    if (parsed) return { status: "ok", ledger: parsed };
  } catch {
    // fallthrough
  }
  return { status: "corrupt", ledger: emptyLedger() };
}

export function loadLedger(dir: string): Ledger {
  return readLedgerState(dir).ledger;
}

export function saveLedger(dir: string, ledger: Ledger): void {
  mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, LEDGER_FILE), JSON.stringify(ledger, null, 2));
}

export type LedgerAnomalies = {
  missingBody: string[];
  malformedEnvelopes: string[];
  ambiguousLegacy: string[];
  orphanEnvelopes: string[];
};

export function findLedgerAnomalies(dir: string, ledger: Ledger): LedgerAnomalies {
  const envelopeHashes = new Set(listEnvelopeHashes(dir));
  const missingBody: string[] = [];
  for (const e of Object.values(ledger.entries)) {
    if ((e.status === "queued" || e.status === "pending-retry") && readEnvelope(dir, e.hash) === null) {
      missingBody.push(e.hash);
    }
  }

  const malformedEnvelopes: string[] = [];
  const orphanEnvelopes: string[] = [];
  for (const hash of envelopeHashes) {
    const env = readEnvelope(dir, hash);
    if (env === null) malformedEnvelopes.push(hash);
    else if (!ledger.entries[hash]) orphanEnvelopes.push(hash);
  }

  const ambiguousLegacy: string[] = [];
  for (const hash of listLegacyTxtHashes(dir)) {
    if (envelopeHashes.has(hash) || ledger.entries[hash]) continue;
    const text = readLegacyText(dir, hash);
    if (text !== null && legacyContractKind(text) === null) ambiguousLegacy.push(hash);
  }

  return {
    missingBody: missingBody.sort(),
    malformedEnvelopes: malformedEnvelopes.sort(),
    ambiguousLegacy: ambiguousLegacy.sort(),
    orphanEnvelopes: orphanEnvelopes.sort(),
  };
}

function readLegacyText(dir: string, hash: string): string | null {
  const path = join(dir, `${hash}.txt`);
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function legacyContractKind(text: string): FragmentKind | null {
  const first = text.split("\n")[0] ?? "";
  if (first.includes("Alpha Pon 緊急開示")) return "urgent";
  return null;
}

export type EnqueueAction = "added" | "exists" | "already-delivered" | "ledger-corrupt" | "ledger-blocked";

export function enqueueFragment(
  dir: string,
  input: { text: string; kind?: FragmentKind; now?: string },
): { hash: string; action: EnqueueAction } {
  mkdirSync(dir, { recursive: true });
  const hash = contentHash(input.text);
  const now = input.now ?? new Date().toISOString();
  const kind = input.kind ?? "normal";
  const section = detectSection(input.text) ?? parseFragmentText(input.text).section ?? OTHER_SECTION;

  writeEnvelope(dir, { version: 1, hash, kind, section, text: input.text, queuedAt: now });

  const state = readLedgerState(dir);
  if (state.status === "blocked") return { hash, action: "ledger-blocked" };
  if (state.status === "corrupt") {
    blockOnCorrupt(dir, now);
    return { hash, action: "ledger-corrupt" };
  }

  const ledger = state.ledger;
  const existing = ledger.entries[hash];
  if (existing?.status === "sent") {
    deleteFragmentByHash(dir, hash);
    return { hash, action: "already-delivered" };
  }
  ensureEntry(ledger, { hash, section, kind, now });
  saveLedger(dir, ledger);
  return { hash, action: existing ? "exists" : "added" };
}

export type PendingFragment = { hash: string; section: string; body: string; text: string; kind: FragmentKind };

export function loadPendingFragments(dir: string, ledger: Ledger, kind?: FragmentKind): PendingFragment[] {
  const out: PendingFragment[] = [];
  for (const hash of pendingHashes(ledger, kind)) {
    const env = readEnvelope(dir, hash);
    if (env === null) continue;
    const { body } = parseFragmentText(env.text);
    if (body.length === 0) continue;
    out.push({ hash, section: env.section, body, text: env.text, kind: env.kind });
  }
  return out;
}

export function reconcileOrphanFragments(dir: string, ledger: Ledger, now: string): Ledger {
  for (const hash of listEnvelopeHashes(dir)) {
    if (ledger.entries[hash]) continue;
    const env = readEnvelope(dir, hash);
    if (env === null) continue;
    ensureEntry(ledger, { hash, section: env.section, kind: env.kind, now });
  }

  for (const hash of listLegacyTxtHashes(dir)) {
    if (readEnvelope(dir, hash) !== null) continue;
    const text = readLegacyText(dir, hash);
    if (text === null) continue;
    const existing = ledger.entries[hash];
    if (existing) {
      writeEnvelope(dir, {
        version: 1,
        hash,
        kind: existing.kind,
        section: existing.section,
        text,
        queuedAt: existing.queuedAt,
      });
      continue;
    }
    const contractKind = legacyContractKind(text);
    if (contractKind === null) continue;
    const section = detectSection(text) ?? OTHER_SECTION;
    writeEnvelope(dir, { version: 1, hash, kind: contractKind, section, text, queuedAt: now });
    ensureEntry(ledger, { hash, section, kind: contractKind, now });
  }
  return ledger;
}

export { redactSecrets };
