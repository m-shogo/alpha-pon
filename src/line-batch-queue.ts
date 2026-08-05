// LINE通知バッチの永続キュー + 配信台帳（ledger）。
//
// 目的（ChatGPTレビュー Blocking 1/3 対応）:
//  - enqueue しただけでは delivered 扱いにしない。実LINE送信成功時だけ sent にする。
//  - 送信失敗・crash・同日再実行・翌日再実行でも pending fragment を失わない。
//    そのため **安定した pending ディレクトリ**（run-daily-complete.sh の
//    tmp/line-batch-pending）を使い、日付別 dir にしない。
//  - 成功した fragment だけ削除し、再送しない。失敗は attempts と lastError を記録し、
//    上限超過で無限蓄積しないよう MAX_ATTEMPTS で打ち切る。
//  - 一時ファイル書き込みは temp + rename で可能な限り atomic にする。
//
// fragment はコンテンツアドレス（contentHash.txt）で保存し、同一内容の再 enqueue は
// 同じファイルへ上書きされる（重複ファイルを作らない）。ledger は hash キーで状態を持つ。
//
// 純関数（ledger 変換）と薄い FS ラッパを分離し、temp ディレクトリ fixture でテストする。

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

export type FragmentStatus = "queued" | "sent" | "pending-retry" | "failed" | "skipped";
export type FragmentKind = "normal" | "urgent";

// crash 復旧で kind を本文推測に依存しないための durable envelope。
export type FragmentEnvelopeV1 = {
  version: 1;
  hash: string;
  kind: FragmentKind;
  section: string;
  text: string;
  queuedAt: string;
};

// ledger 破損を検知したら書く block marker（本文/Secretは入れない）。
export type BlockMarker = {
  reason: "ledger-corrupt";
  detectedAt: string;
  corruptBackupPath?: string;
};

// ledger の読み取り状態（破損を空ledgerで隠さず区別する）。
export type LedgerStateStatus = "ok" | "corrupt" | "blocked";

export type LedgerEntry = {
  hash: string;
  section: string;
  kind: FragmentKind;
  status: FragmentStatus;
  attempts: number;
  queuedAt: string;
  lastAttemptAt?: string;
  lastError?: string; // redacted, truncated
  deliveredAt?: string; // UTC ISO
  deliveredDateJst?: string; // Asia/Tokyo YYYY-MM-DD（当日判定の正本）
};

export type Ledger = {
  version: 1;
  entries: Record<string, LedgerEntry>;
};

export function emptyLedger(): Ledger {
  return { version: 1, entries: {} };
}

// UTC ISO 文字列を Asia/Tokyo の YYYY-MM-DD へ変換する。
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

// contentHash: 内容の論理IDかつファイル名。send-daily-complete.sh のインライン
// リマインド生成も同じ算出（sha256 hex 先頭16）を使うこと。
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// -------------------------------------------------------
// 純関数: ledger 変換（FSに触れない）
// -------------------------------------------------------

// fragment を ledger に登録する。既に sent のものは触らない（再送しない）。
// 既存 pending/failed は据え置き（重複 enqueue で状態を巻き戻さない）。
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

// 送信失敗。attempts を増やし、上限未満なら pending-retry、上限到達で failed。
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

// 再送候補（queued / pending-retry）の hash。failed（上限到達）は含めない。
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

// 当日(JST) delivered した urgent 件数（「即時通知済み N 件」表示の正本）。
// deliveredDateJst を優先し、無い古いentryは deliveredAt を JST 変換して比較する。
export function countUrgentDeliveredToday(ledger: Ledger, todayJstDate: string): number {
  return Object.values(ledger.entries).filter((e) => {
    if (e.kind !== "urgent" || e.status !== "sent") return false;
    const dateJst = e.deliveredDateJst ?? (e.deliveredAt ? jstDateOf(e.deliveredAt) : undefined);
    return dateJst === todayJstDate;
  }).length;
}

// sent / skipped の古いエントリを掃除（無限蓄積防止）。retentionDays は deliveredAt 基準。
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

// MAX_ATTEMPTS 到達後の手動復旧: failed を queued に戻し再送候補へ（runbook用）。
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

// -------------------------------------------------------
// FS ラッパ（temp ディレクトリ fixture でテスト可能）
// -------------------------------------------------------

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

// -------------------------------------------------------
// Fragment envelope（kind を durable に永続化。本文推測に依存しない）
// -------------------------------------------------------

export function writeEnvelope(dir: string, env: FragmentEnvelopeV1): void {
  mkdirSync(fragmentsPath(dir), { recursive: true });
  atomicWrite(envelopePath(dir, env.hash), JSON.stringify(env, null, 2));
}

// envelope を検証して返す。壊れ/hash不一致は null（送信させない）。
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
  if (typeof e.section !== "string" || typeof e.queuedAt !== "string") return null;
  // filename hash / envelope hash / content hash の三者一致を検証。
  if (e.hash !== hash) return null;
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
  // legacy .txt も掃除
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

// -------------------------------------------------------
// ledger の読み取り / block marker
// -------------------------------------------------------

function parseLedger(raw: string): Ledger | null {
  const parsed = JSON.parse(raw) as Ledger;
  if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object" || parsed.entries === null) {
    return null;
  }
  return { version: 1, entries: parsed.entries };
}

export function readBlockMarker(dir: string): BlockMarker | null {
  const path = join(dir, BLOCKED_FILE);
  if (!existsSync(path)) return null;
  try {
    const m = JSON.parse(readFileSync(path, "utf-8")) as BlockMarker;
    if (m && m.reason === "ledger-corrupt") return m;
  } catch {
    /* 壊れた marker も blocked 扱いにする（下で fallback） */
  }
  return { reason: "ledger-corrupt", detectedAt: "unknown" };
}

export function isBlocked(dir: string): boolean {
  return existsSync(join(dir, BLOCKED_FILE));
}

// 破損検知時に呼ぶ: 破損ledgerを退避し block marker を書く（ledgerは空で上書きしない）。
// runbook で明示的に解除するまで、以降の実行は送信を停止する。
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
      /* 退避失敗でも marker は書く */
    }
  }
  const marker: BlockMarker = { reason: "ledger-corrupt", detectedAt: now, corruptBackupPath };
  atomicWrite(join(dir, BLOCKED_FILE), JSON.stringify(marker, null, 2));
  return marker;
}

// 明示的復旧（runbook用）。自動では絶対に呼ばない。
export function clearBlockMarker(dir: string): void {
  const path = join(dir, BLOCKED_FILE);
  if (existsSync(path)) rmSync(path, { force: true });
}

// ledger の状態を破損を隠さず区別して返す（空ledgerで上書きしない）。
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
    /* fallthrough */
  }
  return { status: "corrupt", ledger: emptyLedger() };
}

// 読み取り専用の安全ロード（副作用なし）: 破損/未存在は空を返す。書き込みには使わない。
export function loadLedger(dir: string): Ledger {
  const s = readLedgerState(dir);
  return s.ledger;
}

export function saveLedger(dir: string, ledger: Ledger): void {
  mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, LEDGER_FILE), JSON.stringify(ledger, null, 2));
}

// -------------------------------------------------------
// anomaly 検出（黙って無視しない）
// -------------------------------------------------------

export type LedgerAnomalies = {
  missingBody: string[]; // pending だが envelope が読めない
  malformedEnvelopes: string[]; // envelope 破損 / hash不一致
  ambiguousLegacy: string[]; // legacy .txt で kind 確定不能（送信しない）
  orphanEnvelopes: string[]; // envelope あり・ledger未登録（reconcileで取り込む）
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
  for (const hash of envelopeHashes) {
    if (readEnvelope(dir, hash) === null) malformedEnvelopes.push(hash);
  }
  const orphanEnvelopes: string[] = [];
  for (const hash of envelopeHashes) {
    if (!ledger.entries[hash] && readEnvelope(dir, hash) !== null) orphanEnvelopes.push(hash);
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
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

// legacy .txt で契約上 kind を確定できるものだけ返す（確定不能は null → 送信しない）。
function legacyContractKind(text: string): FragmentKind | null {
  const first = text.split("\n")[0] ?? "";
  // 契約上明確な TDnet 緊急開示ヘッダのみ urgent と確定する。
  if (first.includes("Alpha Pon 緊急開示")) return "urgent";
  return null; // それ以外（🚨 単独の銘柄urgent含む）は曖昧 → 人間確認待ち
}

// -------------------------------------------------------
// enqueue / 復旧
// -------------------------------------------------------

export type EnqueueAction = "added" | "exists" | "already-delivered" | "ledger-corrupt" | "ledger-blocked";

// fragment をキューへ追加する。
// 1) envelope を atomic 保存（本文と kind を必ず保全）
// 2) block marker / ledger 破損を確認
// 3) blocked/corrupt なら ledger を更新せず、正常 ledger で上書きもしない（送信は止まる）
export function enqueueFragment(
  dir: string,
  input: { text: string; kind?: FragmentKind; now?: string },
): { hash: string; action: EnqueueAction } {
  mkdirSync(dir, { recursive: true });
  const hash = contentHash(input.text);
  const now = input.now ?? new Date().toISOString();
  const kind = input.kind ?? "normal";
  const section = detectSection(input.text) ?? parseFragmentText(input.text).section ?? OTHER_SECTION;

  // 1) envelope を先に保全（crash しても kind を失わない）。
  writeEnvelope(dir, { version: 1, hash, kind, section, text: input.text, queuedAt: now });

  // 2) block marker / 破損を確認（破損を空ledgerで隠さない）。
  const state = readLedgerState(dir);
  if (state.status === "blocked") return { hash, action: "ledger-blocked" };
  if (state.status === "corrupt") {
    blockOnCorrupt(dir, now);
    return { hash, action: "ledger-corrupt" };
  }

  const ledger = state.ledger;
  const existing = ledger.entries[hash];
  if (existing?.status === "sent") {
    // 既に delivered。pending envelope は不要（再送しない）。
    deleteFragmentByHash(dir, hash);
    return { hash, action: "already-delivered" };
  }
  ensureEntry(ledger, { hash, section, kind, now });
  saveLedger(dir, ledger);
  return { hash, action: existing ? "exists" : "added" };
}

export type PendingFragment = { hash: string; section: string; body: string; text: string; kind: FragmentKind };

// pending（queued/pending-retry）な hash から envelope を読み出す（kind は envelope 由来）。
export function loadPendingFragments(dir: string, ledger: Ledger, kind?: FragmentKind): PendingFragment[] {
  const out: PendingFragment[] = [];
  for (const hash of pendingHashes(ledger, kind)) {
    const env = readEnvelope(dir, hash);
    if (env === null) continue; // envelope 欠落/破損は anomaly（findLedgerAnomalies で surface）
    const { body } = parseFragmentText(env.text);
    if (body.length === 0) continue;
    out.push({ hash, section: env.section, body, text: env.text, kind: env.kind });
  }
  return out;
}

// crash 復旧: envelope（kind保持）と legacy .txt を安全に ledger へ取り込む。
// 曖昧な legacy は送信対象にしない（anomaly 側で surface）。
export function reconcileOrphanFragments(dir: string, ledger: Ledger, now: string): Ledger {
  // 1) envelope（kind を保持したまま復旧）。
  for (const hash of listEnvelopeHashes(dir)) {
    if (ledger.entries[hash]) continue;
    const env = readEnvelope(dir, hash);
    if (env === null) continue; // malformed は取り込まない（anomaly）
    ensureEntry(ledger, { hash, section: env.section, kind: env.kind, now });
  }
  // 2) legacy .txt（envelope が無いもののみ）。
  for (const hash of listLegacyTxtHashes(dir)) {
    if (readEnvelope(dir, hash) !== null) continue; // envelope 優先
    const text = readLegacyText(dir, hash);
    if (text === null) continue;
    const existing = ledger.entries[hash];
    if (existing) {
      // ledger の kind で envelope へ移行（元 .txt は成功確認まで残す）。
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
    if (contractKind === null) continue; // 曖昧 → 送信しない（anomaly）
    const section = detectSection(text) ?? OTHER_SECTION;
    writeEnvelope(dir, { version: 1, hash, kind: contractKind, section, text, queuedAt: now });
    ensureEntry(ledger, { hash, section, kind: contractKind, now });
  }
  return ledger;
}

export { redactSecrets };
