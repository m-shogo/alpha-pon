// urgent（即時）通知の共通配信ロジック（送信前 dedupe + retryability + ledger安全）。
//
// ChatGPTレビュー Round2 Blocking B/D + Round3 Blocking 1/2 対応:
//  - 送信前に ledger を確認し、既に sent の同一論理通知は LINE を呼ばず skipped を返す。
//  - dry-run / credentials-missing は retry budget を消費せず pending 維持。
//  - http-4xx / http-5xx / network-error だけ attempts を消費する。
//  - 実送信成功時のみ delivered 記録（dedupe）＋ envelope 削除。
//  - **ledger 破損 / block marker は throw せず構造化 outcome で返す**（daily を止めない）。
//  - process 再起動後も ledger により重複送信を防ぐ。
//
// notify.ts（銘柄urgent / TDnet開示）と send-consolidated-line.ts（pending再送）が共通利用する。

import {
  consumesRetryBudget,
  redactSecrets,
  type LineTransport,
} from "./line-consolidation.js";
import {
  blockOnCorrupt,
  contentHash,
  deleteFragmentByHash,
  ensureEntry,
  markFailed,
  markSent,
  readLedgerState,
  saveLedger,
  writeEnvelope,
  type FragmentKind,
} from "./line-batch-queue.js";
import { recordTextNotification } from "./notification-dedupe.js";

export type UrgentDeliveryOutcome =
  | "sent"
  | "skipped-already-sent"
  | "dry-run"
  | "credentials-missing"
  | "http-4xx"
  | "http-5xx"
  | "network-error"
  | "failed-max-attempts"
  | "ledger-corrupt"
  | "ledger-blocked";

export type UrgentDeliveryResult = {
  hash: string;
  outcome: UrgentDeliveryOutcome;
  delivered: boolean; // 実送信で今回届いたか
};

const SECRETS = () => [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID];

// urgent 1件の envelope を保全する（本文と kind を失わない）。
function preserveEnvelope(dir: string, hash: string, text: string, section: string, now: string): void {
  writeEnvelope(dir, { version: 1, hash, kind: "urgent" as FragmentKind, section, text, queuedAt: now });
}

// urgent 1件を配信する。dir があれば ledger を用いた送信前 dedupe / pending 管理を行う。
// ledger 破損 / block は throw せず outcome で返す（呼び出し側の daily を止めない）。
export async function deliverUrgent(
  dir: string | undefined,
  transport: LineTransport,
  input: { text: string; messages: object[]; section?: string; now?: string },
): Promise<UrgentDeliveryResult> {
  const now = input.now ?? new Date().toISOString();
  const hash = contentHash(input.text);
  const section = input.section ?? "🚨 緊急開示";

  if (dir) {
    // 破損/blockを先に確認し、実送信しない（本文は envelope で保全）。
    const state = readLedgerState(dir);
    if (state.status === "blocked") {
      preserveEnvelope(dir, hash, input.text, section, now);
      return { hash, outcome: "ledger-blocked", delivered: false };
    }
    if (state.status === "corrupt") {
      preserveEnvelope(dir, hash, input.text, section, now);
      blockOnCorrupt(dir, now);
      return { hash, outcome: "ledger-corrupt", delivered: false };
    }
    const ex = state.ledger.entries[hash];
    if (ex?.status === "sent") return { hash, outcome: "skipped-already-sent", delivered: false };
    if (ex?.status === "failed") return { hash, outcome: "failed-max-attempts", delivered: false };
  }

  const res = await transport.send(input.messages);

  if (res.ok) {
    if (dir) {
      const state = readLedgerState(dir);
      if (state.status !== "ok") {
        // 送信直後に破損/block を検知したら、これ以上状態を触らない（envelope保全のみ）。
        preserveEnvelope(dir, hash, input.text, section, now);
        recordTextNotification(input.text);
        return { hash, outcome: "sent", delivered: true };
      }
      const ledger = state.ledger;
      ensureEntry(ledger, { hash, section, kind: "urgent", now });
      markSent(ledger, [hash], now);
      saveLedger(dir, ledger);
      deleteFragmentByHash(dir, hash);
    }
    recordTextNotification(input.text);
    return { hash, outcome: "sent", delivered: true };
  }

  // --- 実送信していない結果: pending 維持・attempts非消費 ---
  if (res.outcome === "dry-run" || res.outcome === "credentials-missing") {
    if (dir) {
      preserveEnvelope(dir, hash, input.text, section, now);
      registerPending(dir, hash, section, now);
    }
    return { hash, outcome: res.outcome, delivered: false };
  }

  // --- 実送信失敗: attempts 消費（http/network のみ）---
  if (dir && consumesRetryBudget(res.outcome)) {
    preserveEnvelope(dir, hash, input.text, section, now);
    registerPending(dir, hash, section, now);
    const state = readLedgerState(dir);
    if (state.status === "ok") {
      const ledger = state.ledger;
      markFailed(ledger, [hash], redactSecrets(res.error ?? res.outcome, SECRETS()), now);
      saveLedger(dir, ledger);
      return {
        hash,
        outcome: ledger.entries[hash]?.status === "failed" ? "failed-max-attempts" : res.outcome,
        delivered: false,
      };
    }
  }

  return { hash, outcome: res.outcome, delivered: false };
}

// ledger が ok のとき、pending entry を登録する（無ければ queued）。
function registerPending(dir: string, hash: string, section: string, now: string): void {
  const state = readLedgerState(dir);
  if (state.status !== "ok") return;
  if (!state.ledger.entries[hash]) {
    ensureEntry(state.ledger, { hash, section, kind: "urgent", now });
    saveLedger(dir, state.ledger);
  }
}
