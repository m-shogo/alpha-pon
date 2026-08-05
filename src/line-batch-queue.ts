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
const OTHER_SECTION = "📋 その他";

export type FragmentStatus = "queued" | "sent" | "pending-retry" | "failed" | "skipped";
export type FragmentKind = "normal" | "urgent";

export type LedgerEntry = {
  hash: string;
  section: string;
  kind: FragmentKind;
  status: FragmentStatus;
  attempts: number;
  queuedAt: string;
  lastAttemptAt?: string;
  lastError?: string; // redacted, truncated
  deliveredAt?: string;
};

export type Ledger = {
  version: 1;
  entries: Record<string, LedgerEntry>;
};

export function emptyLedger(): Ledger {
  return { version: 1, entries: {} };
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

// 当日 delivered した urgent 件数（「即時通知済み N 件」表示の正本）。
export function countUrgentDeliveredToday(ledger: Ledger, today: string): number {
  return Object.values(ledger.entries).filter(
    (e) => e.kind === "urgent" && e.status === "sent" && (e.deliveredAt ?? "").startsWith(today),
  ).length;
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

// -------------------------------------------------------
// FS ラッパ（temp ディレクトリ fixture でテスト可能）
// -------------------------------------------------------

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmp, data, "utf-8");
  renameSync(tmp, path);
}

export function loadLedger(dir: string): Ledger {
  const path = join(dir, LEDGER_FILE);
  if (!existsSync(path)) return emptyLedger();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Ledger;
    if (!parsed || typeof parsed !== "object" || !parsed.entries) return emptyLedger();
    return { version: 1, entries: parsed.entries };
  } catch {
    return emptyLedger();
  }
}

export function saveLedger(dir: string, ledger: Ledger): void {
  mkdirSync(dir, { recursive: true });
  atomicWrite(join(dir, LEDGER_FILE), JSON.stringify(ledger, null, 2));
}

export function listFragmentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
}

export function readFragmentByHash(dir: string, hash: string): string | null {
  const path = join(dir, `${hash}.txt`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function deleteFragmentByHash(dir: string, hash: string): void {
  const path = join(dir, `${hash}.txt`);
  if (existsSync(path)) rmSync(path, { force: true });
}

// fragment をキューへ追加（ファイル書き込み + ledger 登録）。
// 既に delivered(sent) の内容は再登録しない（再送防止）。
export function enqueueFragment(
  dir: string,
  input: { text: string; kind?: FragmentKind; now?: string },
): { hash: string; action: "added" | "exists" | "already-delivered" } {
  mkdirSync(dir, { recursive: true });
  const hash = contentHash(input.text);
  const ledger = loadLedger(dir);
  const { section } = parseFragmentText(input.text);
  const sectionLabel = detectSection(input.text) ?? section ?? OTHER_SECTION;
  const { action } = ensureEntry(ledger, {
    hash,
    section: sectionLabel,
    kind: input.kind ?? "normal",
    now: input.now ?? new Date().toISOString(),
  });
  if (action !== "already-delivered") {
    // fragment 本文を content-addressed で保存（atomic）。
    atomicWrite(join(dir, `${hash}.txt`), input.text);
    saveLedger(dir, ledger);
  }
  return { hash, action };
}

// pending（queued/pending-retry）な hash から、本文が読める fragment を取り出す。
export function loadPendingFragments(
  dir: string,
  ledger: Ledger,
  kind?: FragmentKind,
): Array<{ hash: string; section: string; body: string; text: string }> {
  const out: Array<{ hash: string; section: string; body: string; text: string }> = [];
  for (const hash of pendingHashes(ledger, kind)) {
    const text = readFragmentByHash(dir, hash);
    if (text === null) continue; // ファイルが失われた場合はスキップ
    const { section, body } = parseFragmentText(text);
    const sectionLabel = ledger.entries[hash]?.section ?? section;
    if (body.length === 0) continue;
    out.push({ hash, section: sectionLabel, body, text });
  }
  return out;
}

// ディレクトリ内の .txt で ledger に未登録のものを queued として取り込む
// （各ステップが enqueueFragment を経ず素で .txt を落とした場合の保険）。
export function reconcileOrphanFragments(dir: string, ledger: Ledger, now: string): Ledger {
  for (const file of listFragmentFiles(dir)) {
    const hash = file.replace(/\.txt$/, "");
    if (ledger.entries[hash]) continue;
    const text = readFragmentByHash(dir, hash);
    if (text === null) continue;
    const sectionLabel = detectSection(text) ?? OTHER_SECTION;
    ensureEntry(ledger, { hash, section: sectionLabel, kind: "normal", now });
  }
  return ledger;
}

export { redactSecrets };
