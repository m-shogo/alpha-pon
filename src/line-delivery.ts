// urgent（即時）通知の共通配信ロジック（送信前 dedupe + retryability を集約）。
//
// ChatGPTレビュー Round2 Blocking B/D 対応:
//  - 送信前に ledger を確認し、既に sent の同一論理通知は LINE を呼ばず skipped を返す。
//  - dry-run / credentials-missing は retry budget を消費せず pending 維持（次回real送信で1回だけ送る）。
//  - http-4xx / http-5xx / network-error だけ attempts を消費する。
//  - 実送信成功時のみ delivered 記録（dedupe）＋ fragment 削除。
//  - process 再起動後も ledger により重複送信を防ぐ。
//
// notify.ts（銘柄urgent / TDnet開示）と send-consolidated-line.ts（pending再送）が共通利用する。

import {
  consumesRetryBudget,
  redactSecrets,
  type LineTransport,
} from "./line-consolidation.js";
import {
  contentHash,
  deleteFragmentByHash,
  enqueueFragment,
  loadLedgerStrict,
  markFailed,
  markSent,
  saveLedger,
  MAX_ATTEMPTS,
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
  | "failed-max-attempts";

export type UrgentDeliveryResult = {
  hash: string;
  outcome: UrgentDeliveryOutcome;
  delivered: boolean; // 実送信で今回届いたか
};

const SECRETS = () => [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID];

// urgent 1件を配信する。dir があれば ledger を用いた送信前 dedupe / pending 管理を行う。
// messages は LINE へ送る配列（flex / text）。text は hash/dedup/pending 再送に使う安定表現。
export async function deliverUrgent(
  dir: string | undefined,
  transport: LineTransport,
  input: { text: string; messages: object[]; now?: string },
): Promise<UrgentDeliveryResult> {
  const now = input.now ?? new Date().toISOString();
  const hash = contentHash(input.text);

  // --- 送信前 dedupe（ledgerがある場合のみ）---
  if (dir) {
    const ledger = loadLedgerStrict(dir); // 壊れていれば throw（呼び出し側で安全側停止）
    const ex = ledger.entries[hash];
    if (ex?.status === "sent") {
      return { hash, outcome: "skipped-already-sent", delivered: false };
    }
    if (ex?.status === "failed") {
      // 上限到達済み。自動再送しない（runbookで手動requeue）。
      return { hash, outcome: "failed-max-attempts", delivered: false };
    }
  }

  const res = await transport.send(input.messages);

  if (res.ok) {
    if (dir) {
      const ledger = loadLedgerStrict(dir);
      enqueueEntry(dir, ledger, hash, input.text, now); // 無ければ queued 登録
      markSent(ledger, [hash], now);
      saveLedger(dir, ledger);
      deleteFragmentByHash(dir, hash);
    }
    recordTextNotification(input.text);
    return { hash, outcome: "sent", delivered: true };
  }

  // --- 実送信していない結果: pending 維持・attempts非消費 ---
  if (res.outcome === "dry-run" || res.outcome === "credentials-missing") {
    if (dir) enqueueFragment(dir, { text: input.text, kind: "urgent", now }); // pending 保持
    return { hash, outcome: res.outcome, delivered: false };
  }

  // --- 実送信失敗: attempts 消費（http/network のみ）---
  if (dir && consumesRetryBudget(res.outcome)) {
    enqueueFragment(dir, { text: input.text, kind: "urgent", now }); // 本文・entry保持
    const ledger = loadLedgerStrict(dir);
    markFailed(ledger, [hash], redactSecrets(res.error ?? res.outcome, SECRETS()), now);
    saveLedger(dir, ledger);
    const status = ledger.entries[hash]?.status;
    return { hash, outcome: status === "failed" ? "failed-max-attempts" : res.outcome, delivered: false };
  }

  return { hash, outcome: res.outcome, delivered: false };
}

// ledger に無ければ queued として登録し、本文ファイルも保持する。
function enqueueEntry(dir: string, ledger: ReturnType<typeof loadLedgerStrict>, hash: string, text: string, now: string): void {
  if (!ledger.entries[hash]) {
    // 送信直前に登録（file はまだ無いこともあるので保険で書く）。
    enqueueFragment(dir, { text, kind: "urgent", now });
    const reloaded = loadLedgerStrict(dir);
    ledger.entries[hash] = reloaded.entries[hash] ?? {
      hash,
      section: "🚨 緊急開示",
      kind: "urgent",
      status: "queued",
      attempts: 0,
      queuedAt: now,
    };
  }
}

export { MAX_ATTEMPTS };
