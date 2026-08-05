// urgent（即時）通知の共通配信ロジック。
// 送信前に envelope + queued ledger を永続化し、crash時も再送候補を失わない。

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
  delivered: boolean;
};

const SECRETS = () => [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID];

function preserveEnvelope(
  dir: string,
  hash: string,
  text: string,
  section: string,
  queuedAt: string,
): void {
  writeEnvelope(dir, { version: 1, hash, kind: "urgent", section, text, queuedAt });
}

export async function deliverUrgent(
  dir: string | undefined,
  transport: LineTransport,
  input: { text: string; messages: object[]; section?: string; now?: string },
): Promise<UrgentDeliveryResult> {
  const now = input.now ?? new Date().toISOString();
  const hash = contentHash(input.text);
  const section = input.section ?? "🚨 緊急開示";

  if (dir) {
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

    const existing = state.ledger.entries[hash];
    if (existing?.status === "sent" || existing?.status === "skipped") {
      return { hash, outcome: "skipped-already-sent", delivered: false };
    }
    if (existing?.status === "failed") {
      preserveEnvelope(dir, hash, input.text, section, existing.queuedAt);
      return { hash, outcome: "failed-max-attempts", delivered: false };
    }

    // transportへ渡す前に本文・kind・queued entryをdurableにする。
    const queuedAt = existing?.queuedAt ?? now;
    preserveEnvelope(dir, hash, input.text, section, queuedAt);
    ensureEntry(state.ledger, { hash, section, kind: "urgent", now: queuedAt });
    // 同一本文がnormalとして先にqueueされていてもurgentへ昇格し、crash復旧で降格させない。
    state.ledger.entries[hash].kind = "urgent";
    state.ledger.entries[hash].section = section;
    saveLedger(dir, state.ledger);
  }

  // ここでthrow/crashしても、dirありなら送信前状態はdiskに残っている。
  const res = await transport.send(input.messages);

  if (res.ok) {
    if (dir) {
      const state = readLedgerState(dir);
      if (state.status !== "ok") {
        // remote成功後にledgerを確定できない窓。envelopeは残し、at-least-once制約として復旧対象にする。
        preserveEnvelope(dir, hash, input.text, section, now);
        if (state.status === "corrupt") blockOnCorrupt(dir, now);
        recordTextNotification(input.text);
        return { hash, outcome: "sent", delivered: true };
      }
      markSent(state.ledger, [hash], now);
      saveLedger(dir, state.ledger);
      deleteFragmentByHash(dir, hash);
    }
    recordTextNotification(input.text);
    return { hash, outcome: "sent", delivered: true };
  }

  // dry-run / credentials不足は送信attemptではない。queuedのままretry budgetを消費しない。
  if (res.outcome === "dry-run" || res.outcome === "credentials-missing") {
    return { hash, outcome: res.outcome, delivered: false };
  }

  if (dir && consumesRetryBudget(res.outcome)) {
    const state = readLedgerState(dir);
    if (state.status === "corrupt") {
      blockOnCorrupt(dir, now);
      return { hash, outcome: "ledger-corrupt", delivered: false };
    }
    if (state.status === "blocked") {
      return { hash, outcome: "ledger-blocked", delivered: false };
    }

    markFailed(
      state.ledger,
      [hash],
      redactSecrets(res.error ?? res.outcome, SECRETS()),
      now,
    );
    saveLedger(dir, state.ledger);
    return {
      hash,
      outcome: state.ledger.entries[hash]?.status === "failed" ? "failed-max-attempts" : res.outcome,
      delivered: false,
    };
  }

  return { hash, outcome: res.outcome, delivered: false };
}
