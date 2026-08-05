// LINE統合通知の実行時 CLI ラッパ。
//
// 安定 pending dir（LINE_BATCH_DIR = tmp/line-batch-pending）を読み、
//  1) pending な緊急fragmentを即時経路で再送、
//  2) pending な通常fragmentを1通へ統合して送信、
// する。実LINE送信が成功した fragment だけ delivered として ledger に記録・削除し、
// 省略/切り詰め/失敗した fragment は pending のまま残す（次回実行が再送する）。
//
// 契約:
//  - queued/dry-run を sent として扱わない。
//  - 送信失敗は throw せず「非致命的な結果」として扱い、daily pipeline を止めない
//    （プロセスは常に exit 0）。
//  - トークン / userId 等の秘匿値をログ・エラー・ledger へ出さない。

import { existsSync } from "fs";
import { todayJst } from "./date.js";
import {
  buildConsolidatedMessage,
  createTransport,
  redactSecrets,
  type LineTransport,
} from "./line-consolidation.js";
import {
  countUrgentDeliveredToday,
  deleteFragmentByHash,
  loadLedger,
  loadPendingFragments,
  markFailed,
  markSent,
  markSkipped,
  pruneLedger,
  reconcileOrphanFragments,
  saveLedger,
} from "./line-batch-queue.js";
import { recordTextNotification } from "./notification-dedupe.js";

type RunResult = {
  status: "sent" | "dry-run" | "skipped" | "failed" | "partial";
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
};

const SECRETS = () => [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID];

function logResult(result: RunResult): void {
  const safe = redactSecrets(JSON.stringify(result), SECRETS());
  console.log(`line:consolidated result ${safe}`);
}

// pending な緊急fragmentを個別に即時再送する。成功した分だけ delivered 記録・削除。
async function retryUrgent(
  dir: string,
  transport: LineTransport,
  now: string,
): Promise<{ retried: number; delivered: number }> {
  const ledger = loadLedger(dir);
  const urgent = loadPendingFragments(dir, ledger, "urgent");
  let delivered = 0;
  for (const frag of urgent) {
    const res = await transport.send([{ type: "text", text: frag.text }]);
    if (res.ok) {
      markSent(ledger, [frag.hash], now);
      recordTextNotification(frag.text);
      deleteFragmentByHash(dir, frag.hash);
      delivered += 1;
    } else if (res.outcome === "dry-run" || res.outcome === "credentials-missing") {
      // 実送信なし → 状態を変えず pending のまま。
    } else {
      markFailed(ledger, [frag.hash], res.error ?? res.outcome, now);
    }
  }
  saveLedger(dir, ledger);
  return { retried: urgent.length, delivered };
}

async function main(): Promise<RunResult> {
  const dir = process.env.LINE_BATCH_DIR;
  if (!dir || !existsSync(dir)) {
    return { status: "skipped", reason: "LINE_BATCH_DIR未設定またはディレクトリなし" };
  }

  const now = new Date().toISOString();
  const today = todayJst();
  const transport = createTransport();

  // ledger を最新化（素で置かれた .txt を取り込む）。
  {
    const ledger = reconcileOrphanFragments(dir, loadLedger(dir), now);
    saveLedger(dir, ledger);
  }

  // 1) pending な緊急fragmentの即時再送。
  const urgent = await retryUrgent(dir, transport, now);

  // 2) 通常fragmentを1通へ統合。
  const ledger = loadLedger(dir);
  const normal = loadPendingFragments(dir, ledger, "normal");
  const immediateUrgentCount = countUrgentDeliveredToday(ledger, today);

  const built = buildConsolidatedMessage(
    normal.map((f) => ({ hash: f.hash, section: f.section, body: f.body })),
    { today, immediateUrgentCount },
  );

  const base = {
    urgentRetried: urgent.retried,
    urgentDelivered: urgent.delivered,
  };

  if (built.message === null) {
    // 通常は無いが緊急を送った/pendingは残る、というケース。
    const pendingAfter = loadPendingFragments(dir, loadLedger(dir)).length;
    saveLedger(dir, pruneOld(ledger, now));
    return { status: urgent.delivered > 0 ? "sent" : "skipped", reason: "通常統合対象なし", ...base, pendingAfter };
  }

  const sendRes = await transport.send([{ type: "text", text: built.message }]);

  const buildBase = {
    ...base,
    normalSections: built.sections.length,
    normalChars: built.message.length,
    includedItems: built.includedCount,
    omittedItems: built.omittedItemCount,
    droppedDuplicates: built.droppedDuplicateCount,
    truncated: built.truncated,
  };

  if (transport.mode === "dry-run" || sendRes.outcome === "dry-run") {
    // ドライラン: 何も delivered にしない（本文だけ確認）。
    console.log("LINE統合通知（ドライラン。実送信なし）:");
    console.log(built.message);
    const pendingAfter = loadPendingFragments(dir, loadLedger(dir)).length;
    return { status: "dry-run", ...buildBase, pendingAfter };
  }

  if (!sendRes.ok) {
    // 送信失敗: 統合対象を pending-retry へ。omitted は元々 pending 継続。二重送信しない。
    markFailed(ledger, built.includedHashes, sendRes.error ?? sendRes.outcome, now);
    saveLedger(dir, ledger);
    const pendingAfter = loadPendingFragments(dir, loadLedger(dir)).length;
    return {
      status: "failed",
      reason: redactSecrets(sendRes.error ?? sendRes.outcome, SECRETS()),
      ...buildBase,
      pendingAfter,
    };
  }

  // 送信成功: 実際に含まれた代表だけ delivered、その重複は skipped、
  // ファイル削除は delivered/skipped のみ。omitted は pending 継続。
  markSent(ledger, built.includedHashes, now);
  markSkipped(ledger, built.skippedDuplicateHashes, now);
  for (const frag of normal) {
    if (built.includedHashes.includes(frag.hash)) {
      recordTextNotification(frag.text);
      deleteFragmentByHash(dir, frag.hash);
    } else if (built.skippedDuplicateHashes.includes(frag.hash)) {
      deleteFragmentByHash(dir, frag.hash);
    }
  }
  saveLedger(dir, pruneOld(ledger, now));

  const pendingAfter = loadPendingFragments(dir, loadLedger(dir)).length;
  return {
    status: built.omittedItemCount > 0 ? "partial" : "sent",
    ...buildBase,
    pendingAfter,
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
