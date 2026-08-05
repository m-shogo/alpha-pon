// LINE統合通知の実行時 CLI ラッパ。
//
// 安定 pending dir（LINE_BATCH_DIR = tmp/line-batch-pending）を読み、
//  1) pending な緊急fragmentを即時経路で再送（送信前dedupe付き）、
//  2) pending な通常fragmentを1通へ統合して送信、
// する。実LINE送信が成功した fragment だけ delivered として ledger に記録・削除し、
// 省略/切り詰め/失敗した fragment は pending のまま残す（次回実行が再送する）。
//
// 契約:
//  - queued/dry-run/credentials-missing を sent として扱わない。
//  - dry-run / credentials-missing は retry budget を消費しない（http/networkのみ消費）。
//  - ledger 破損時は退避のうえ送信を停止（重複送信を防ぐ安全側）。
//  - 送信失敗は throw せず非致命（プロセスは常に exit 0）。
//  - トークン / userId 等の秘匿値をログ・エラー・ledger へ出さない。

import { existsSync } from "fs";
import { basename } from "path";
import { todayJst } from "./date.js";
import {
  buildConsolidatedMessage,
  consumesRetryBudget,
  createTransport,
  redactSecrets,
  type LineTransport,
} from "./line-consolidation.js";
import {
  countUrgentDeliveredToday,
  deleteFragmentByHash,
  findLedgerAnomalies,
  loadLedger,
  loadLedgerStrict,
  LedgerCorruptError,
  loadPendingFragments,
  markFailed,
  markSent,
  markSkipped,
  pruneLedger,
  reconcileOrphanFragments,
  saveLedger,
} from "./line-batch-queue.js";
import { deliverUrgent } from "./line-delivery.js";
import { recordTextNotification } from "./notification-dedupe.js";

type RunResult = {
  status: "sent" | "dry-run" | "skipped" | "failed" | "partial" | "credentials-missing";
  reason?: string;
  urgentRetried?: number;
  urgentDelivered?: number;
  normalSections?: number;
  normalChars?: number;
  includedItems?: number;
  omittedItems?: number;
  droppedDuplicates?: number;
  truncated?: boolean;
  pendingAfter?: number;
  anomalies?: { missingBody: number; orphanFiles: number };
};

const SECRETS = () => [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID];

function logResult(result: RunResult): void {
  const safe = redactSecrets(JSON.stringify(result), SECRETS());
  console.log(`line:consolidated result ${safe}`);
}

// pending な緊急fragmentを個別に即時再送（送信前dedupe・retryabilityは deliverUrgent が担う）。
async function retryUrgent(
  dir: string,
  transport: LineTransport,
): Promise<{ retried: number; delivered: number }> {
  const ledger = loadLedgerStrict(dir);
  const urgent = loadPendingFragments(dir, ledger, "urgent");
  let delivered = 0;
  for (const frag of urgent) {
    const res = await deliverUrgent(dir, transport, {
      text: frag.text,
      messages: [{ type: "text", text: frag.text }],
    });
    if (res.outcome === "sent") delivered += 1;
  }
  return { retried: urgent.length, delivered };
}

function pendingCount(dir: string): number {
  return loadPendingFragments(dir, loadLedger(dir)).length;
}

async function main(): Promise<RunResult> {
  const dir = process.env.LINE_BATCH_DIR;
  if (!dir || !existsSync(dir)) {
    return { status: "skipped", reason: "LINE_BATCH_DIR未設定またはディレクトリなし" };
  }

  const now = new Date().toISOString();
  const today = todayJst();
  const transport = createTransport();

  // ledger を安全に読む。破損していれば退避して送信を停止（重複送信を防ぐ）。
  let ledger;
  try {
    ledger = loadLedgerStrict(dir);
  } catch (err) {
    if (err instanceof LedgerCorruptError) {
      const where = err.backupPath ? `退避先 ${basename(err.backupPath)}` : "退避失敗";
      return { status: "failed", reason: `ledger破損のため送信停止（${where}）` };
    }
    throw err;
  }

  // 素で置かれた .txt を取り込み、実ファイルとの不整合を surface する。
  reconcileOrphanFragments(dir, ledger, now);
  saveLedger(dir, ledger);
  const anomalyDetail = findLedgerAnomalies(dir, ledger);
  const anomalies = { missingBody: anomalyDetail.missingBody.length, orphanFiles: anomalyDetail.orphanFiles.length };
  if (anomalyDetail.missingBody.length > 0) {
    console.warn(`ledger anomaly: 本文欠落 ${anomalyDetail.missingBody.length}件（pending扱い・送信対象外）`);
  }

  // 1) pending な緊急fragmentの即時再送。
  const urgent = await retryUrgent(dir, transport);

  // 2) 通常fragmentを1通へ統合。
  ledger = loadLedgerStrict(dir);
  const normal = loadPendingFragments(dir, ledger, "normal");
  const immediateUrgentCount = countUrgentDeliveredToday(ledger, today);

  const built = buildConsolidatedMessage(
    normal.map((f) => ({ hash: f.hash, section: f.section, body: f.body })),
    { today, immediateUrgentCount },
  );

  const base = { urgentRetried: urgent.retried, urgentDelivered: urgent.delivered, anomalies };

  if (built.message === null) {
    saveLedger(dir, pruneOld(ledger, now));
    return {
      status: urgent.delivered > 0 ? "sent" : "skipped",
      reason: "通常統合対象なし",
      ...base,
      pendingAfter: pendingCount(dir),
    };
  }

  const sendRes = await transport.send([{ type: "text", text: built.message }]);

  const buildBase = {
    ...base,
    normalSections: built.includedSectionCount,
    normalChars: built.message.length,
    includedItems: built.includedCount,
    omittedItems: built.omittedItemCount,
    droppedDuplicates: built.droppedDuplicateCount,
    truncated: built.truncated,
  };

  // ドライラン: 何も delivered にしない（本文だけ確認、pending維持）。
  if (transport.mode === "dry-run" || sendRes.outcome === "dry-run") {
    console.log("LINE統合通知（ドライラン。実送信なし）:");
    console.log(built.message);
    return { status: "dry-run", ...buildBase, pendingAfter: pendingCount(dir) };
  }

  // credentials-missing: 実送信していない → retry budget を消費せず pending 維持。
  if (sendRes.outcome === "credentials-missing") {
    return { status: "credentials-missing", ...buildBase, pendingAfter: pendingCount(dir) };
  }

  // http/network 失敗: 実送信attempt → 統合対象を pending-retry へ（omittedは元々pending継続）。
  if (!sendRes.ok && consumesRetryBudget(sendRes.outcome)) {
    markFailed(ledger, built.includedHashes, redactSecrets(sendRes.error ?? sendRes.outcome, SECRETS()), now);
    saveLedger(dir, ledger);
    return {
      status: "failed",
      reason: redactSecrets(sendRes.error ?? sendRes.outcome, SECRETS()),
      ...buildBase,
      pendingAfter: pendingCount(dir),
    };
  }

  if (!sendRes.ok) {
    // 想定外の !ok（分類外）: 安全側に pending 維持、attempts非消費。
    return { status: "failed", reason: sendRes.outcome, ...buildBase, pendingAfter: pendingCount(dir) };
  }

  // 送信成功: 本文へ実際に含まれた fragment だけ delivered、その重複は skipped、
  // ファイル削除は delivered/skipped のみ。omitted は pending 継続。
  markSent(ledger, built.includedHashes, now);
  markSkipped(ledger, built.skippedDuplicateHashes, now);
  const includedSet = new Set(built.includedHashes);
  const skippedSet = new Set(built.skippedDuplicateHashes);
  for (const frag of normal) {
    if (includedSet.has(frag.hash)) {
      recordTextNotification(frag.text);
      deleteFragmentByHash(dir, frag.hash);
    } else if (skippedSet.has(frag.hash)) {
      deleteFragmentByHash(dir, frag.hash);
    }
  }
  saveLedger(dir, pruneOld(ledger, now));

  return {
    status: built.omittedItemCount > 0 ? "partial" : "sent",
    ...buildBase,
    pendingAfter: pendingCount(dir),
  };
}

// sent/skipped の古いエントリを掃除（保持3日）。
function pruneOld(ledger: ReturnType<typeof loadLedger>, nowIso: string) {
  const threshold = new Date(new Date(nowIso).getTime() - 3 * 86400000).toISOString();
  return pruneLedger(ledger, threshold).ledger;
}

main()
  .then((result) => {
    logResult(result);
    process.exit(0); // 送信失敗を含め pipeline を止めない。
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logResult({ status: "failed", reason: redactSecrets(message, SECRETS()) });
    process.exit(0);
  });
