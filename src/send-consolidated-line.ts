// LINE統合通知の実行時 CLI ラッパ。
// pending urgentを即時再送し、normalを1通へ統合する。
// 実送信成功したfragmentだけsentとして削除し、それ以外はpendingを維持する。

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
  readBlockMarker,
  readLedgerState,
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
  status: "sent" | "dry-run" | "skipped" | "failed" | "partial" | "credentials-missing" | "blocked";
  reason?: string;
  urgentRetried?: number;
  urgentDelivered?: number;
  normalSections?: number;
  normalChars?: number;
  includedItems?: number;
  omittedItems?: number;
  oversizedItems?: number;
  droppedDuplicates?: number;
  truncated?: boolean;
  pendingAfter?: number;
  anomalies?: { missingBody: number; malformedEnvelopes: number; ambiguousLegacy: number };
};

const SECRETS = () => [process.env.LINE_CHANNEL_TOKEN, process.env.LINE_USER_ID];

function logResult(result: RunResult): void {
  console.log(`line:consolidated result ${redactSecrets(JSON.stringify(result), SECRETS())}`);
}

async function retryUrgent(
  dir: string,
  transport: LineTransport,
): Promise<{ retried: number; delivered: number }> {
  const urgent = loadPendingFragments(dir, loadLedger(dir), "urgent");
  let delivered = 0;
  for (const frag of urgent) {
    const res = await deliverUrgent(dir, transport, {
      text: frag.text,
      section: frag.section,
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

  {
    const state = readLedgerState(dir);
    if (state.status === "blocked" || state.status === "corrupt") {
      if (state.status === "corrupt") {
        const { blockOnCorrupt } = await import("./line-batch-queue.js");
        blockOnCorrupt(dir, now);
      }
      const marker = readBlockMarker(dir);
      const where = marker?.corruptBackupPath ? `退避先 ${basename(marker.corruptBackupPath)}` : "退避先なし";
      return { status: "blocked", reason: `ledger破損のため送信停止・要手動復旧（${where}）` };
    }
  }

  let ledger = readLedgerState(dir).ledger;
  reconcileOrphanFragments(dir, ledger, now);
  saveLedger(dir, ledger);

  const anomalyDetail = findLedgerAnomalies(dir, ledger);
  const anomalies = {
    missingBody: anomalyDetail.missingBody.length,
    malformedEnvelopes: anomalyDetail.malformedEnvelopes.length,
    ambiguousLegacy: anomalyDetail.ambiguousLegacy.length,
  };
  if (anomalies.missingBody + anomalies.malformedEnvelopes + anomalies.ambiguousLegacy > 0) {
    console.warn(
      `ledger anomaly: 本文欠落${anomalies.missingBody}/破損envelope${anomalies.malformedEnvelopes}/曖昧legacy${anomalies.ambiguousLegacy}（送信対象外）`,
    );
  }

  const urgent = await retryUrgent(dir, transport);

  ledger = readLedgerState(dir).ledger;
  const normal = loadPendingFragments(dir, ledger, "normal");
  const immediateUrgentCount = countUrgentDeliveredToday(ledger, today);
  const built = buildConsolidatedMessage(
    normal.map((f) => ({ hash: f.hash, section: f.section, body: f.body })),
    { today, immediateUrgentCount },
  );

  const base = { urgentRetried: urgent.retried, urgentDelivered: urgent.delivered, anomalies };

  if (built.oversizedHashes.length > 0) {
    console.warn(
      `LINE fragment anomaly: 単体で文字数上限を超えるnormal ${built.oversizedHashes.length}件をpending維持（hash=${built.oversizedHashes.join(",")}）`,
    );
  }

  if (built.message === null) {
    saveLedger(dir, pruneOld(ledger, now));
    const hasUnsendableNormal = normal.length > 0;
    return {
      status: hasUnsendableNormal ? "partial" : urgent.delivered > 0 ? "sent" : "skipped",
      reason: hasUnsendableNormal
        ? `通常fragmentを掲載できず送信保留（oversized=${built.oversizedHashes.length} omitted=${built.omittedItemCount}）`
        : "通常統合対象なし",
      ...base,
      includedItems: 0,
      omittedItems: built.omittedItemCount,
      oversizedItems: built.oversizedHashes.length,
      pendingAfter: pendingCount(dir),
    };
  }

  const buildBase = {
    ...base,
    normalSections: built.includedSectionCount,
    normalChars: built.message.length,
    includedItems: built.includedCount,
    omittedItems: built.omittedItemCount,
    oversizedItems: built.oversizedHashes.length,
    droppedDuplicates: built.droppedDuplicateCount,
    truncated: built.truncated,
  };

  const sendRes = await transport.send([{ type: "text", text: built.message }]);

  if (transport.mode === "dry-run" || sendRes.outcome === "dry-run") {
    console.log("LINE統合通知（ドライラン。実送信なし）:");
    console.log(built.message);
    return { status: "dry-run", ...buildBase, pendingAfter: pendingCount(dir) };
  }

  if (sendRes.outcome === "credentials-missing") {
    return { status: "credentials-missing", ...buildBase, pendingAfter: pendingCount(dir) };
  }

  if (!sendRes.ok && consumesRetryBudget(sendRes.outcome)) {
    markFailed(
      ledger,
      built.includedHashes,
      redactSecrets(sendRes.error ?? sendRes.outcome, SECRETS()),
      now,
    );
    saveLedger(dir, ledger);
    return {
      status: "failed",
      reason: redactSecrets(sendRes.error ?? sendRes.outcome, SECRETS()),
      ...buildBase,
      pendingAfter: pendingCount(dir),
    };
  }

  if (!sendRes.ok) {
    return { status: "failed", reason: sendRes.outcome, ...buildBase, pendingAfter: pendingCount(dir) };
  }

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

function pruneOld(ledger: ReturnType<typeof loadLedger>, nowIso: string) {
  const threshold = new Date(new Date(nowIso).getTime() - 3 * 86400000).toISOString();
  return pruneLedger(ledger, threshold).ledger;
}

main()
  .then((result) => {
    logResult(result);
    process.exit(0);
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    logResult({ status: "failed", reason: redactSecrets(message, SECRETS()) });
    process.exit(0);
  });
