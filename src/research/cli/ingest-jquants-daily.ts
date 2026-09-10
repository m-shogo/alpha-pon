/**
 * J-Quants の全銘柄日足を「1営業日=1リクエスト」で履歴取り込みする。
 *
 *   pnpm ingest:prices -- --from 2024-06-19 --to 2026-06-19            # 計画のみ
 *   pnpm ingest:prices -- --from 2024-06-19 --to 2026-06-19 --execute  # 実行
 *
 * 性質:
 *   - 既定は dry-run。ネットワークを触らない。
 *   - 再開可能。完了は `<date>.jsonl` の存在で判定する（台帳ではなく実体）。
 *   - 中断安全。`.partial` に書いてから rename する。途中の `.partial` は
 *     起動時に消す。
 *   - 非営業日（0件）も台帳に記録する。記録しないと毎回問い合わせ直しになる。
 *   - ただし「枠外」は記録しない。84日遅延でまだ取れないだけの日を完了扱いに
 *     すると、遅延が明けても二度と取りに行かなくなる。
 *   - Ctrl-C は「いまの1日を書き終えてから」止まる。
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appendPrivatePriceRecords } from "../private-price-store.js";
import { withPriceRecordHash } from "../price-store.js";
import {
  JQuantsFreePriceProvider,
  isJQuantsFreeConfigured,
} from "../providers/jquants-free.js";
import {
  assertIsoDate,
  completedDatesFrom,
  estimateIngestSeconds,
  formatDuration,
  isCompletedOutcome,
  planIngest,
  type IngestLedgerEntry,
} from "../providers/jquants-daily-ingest.js";
import type { JsonSchema } from "../schema.js";

const STORE_ROOT = "research/prices/jquants-free-daily";
const LEDGER_NAME = "_ingest-log.jsonl";

// 2026-09-10 の実測（10リクエスト連続）に基づく。
const MEASURED_OPTIMISTIC_INTERVAL_SEC = 3;
const MEASURED_THROTTLE_EVERY_N = 5;
const MEASURED_THROTTLE_COST_SEC = 90;

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function requiredDate(name: string): string {
  const value = argValue(name)?.trim();
  if (!value) throw new Error(`--${name} is required (YYYY-MM-DD)`);
  return assertIsoDate(value, `--${name}`);
}

function root(): string {
  return resolve(process.cwd(), STORE_ROOT);
}

function ledgerPath(): string {
  return resolve(root(), LEDGER_NAME);
}

function datePath(tradingDate: string): string {
  return resolve(root(), `${tradingDate}.jsonl`);
}

/** 判定そのものは jquants-daily-ingest.ts の純粋関数。ここは I/O だけ。 */
function completedDates(): Set<string> {
  if (!existsSync(root())) return new Set<string>();
  return completedDatesFrom({
    fileNames: readdirSync(root()),
    ledgerContent: existsSync(ledgerPath()) ? readFileSync(ledgerPath(), "utf-8") : "",
  });
}

/** 前回の中断で残った書きかけを消す。残したまま追記すると壊れた行が混ざる。 */
function clearStalePartials(): number {
  if (!existsSync(root())) return 0;
  let removed = 0;
  for (const name of readdirSync(root())) {
    if (!name.endsWith(".jsonl.partial")) continue;
    rmSync(resolve(root(), name), { force: true });
    removed += 1;
  }
  return removed;
}

function schema(): JsonSchema {
  const path = resolve(process.cwd(), "research/schemas/price-record.schema.json");
  if (!existsSync(path)) throw new Error(`price schema not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as JsonSchema;
}

function appendLedger(entry: IngestLedgerEntry): void {
  mkdirSync(root(), { recursive: true, mode: 0o700 });
  appendFileSync(ledgerPath(), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

async function main(): Promise<void> {
  const from = requiredDate("from");
  const to = requiredDate("to");
  const execute = hasFlag("execute");
  const maxDaysRaw = argValue("max-days");
  const maxDays = maxDaysRaw === null ? null : Number(maxDaysRaw);
  if (maxDays !== null && (!Number.isSafeInteger(maxDays) || maxDays < 1)) {
    throw new Error(`--max-days must be a positive integer: ${maxDaysRaw}`);
  }

  const removedPartials = execute ? clearStalePartials() : 0;
  const plan = planIngest({ from, to, completed: completedDates() });
  const targets = maxDays === null ? plan.pending : plan.pending.slice(0, maxDays);
  const estimate = estimateIngestSeconds({
    pendingDays: targets.length,
    optimisticIntervalSec: MEASURED_OPTIMISTIC_INTERVAL_SEC,
    throttleEveryNRequests: MEASURED_THROTTLE_EVERY_N,
    throttleCostSec: MEASURED_THROTTLE_COST_SEC,
  });

  console.log(`期間            ${from} 〜 ${to}（暦日 ${plan.totalCalendarDays}）`);
  console.log(`取り込み済み    ${plan.skippedCompleted} 日`);
  console.log(`週末で除外      ${plan.skippedWeekends} 日`);
  console.log(`残り            ${plan.pending.length} 日${maxDays === null ? "" : `（今回は ${targets.length} 日）`}`);
  console.log(`所要見込み      ${formatDuration(estimate.optimisticSec)} 〜 ${formatDuration(estimate.expectedSec)}`);
  if (removedPartials > 0) console.log(`書きかけを削除  ${removedPartials} 件`);

  if (!execute) {
    console.log("\ndry-run。実行するには --execute を付ける。");
    return;
  }
  if (!isJQuantsFreeConfigured()) {
    console.log("\nJQUANTS_API_KEY が未設定。取り込みは行わない。");
    process.exitCode = 1;
    return;
  }
  if (targets.length === 0) {
    console.log("\n取り込む日がない。");
    return;
  }

  let stopRequested = false;
  process.on("SIGINT", () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    console.log("\n中断要求を受けた。いまの1日を書き終えてから止まる（もう一度 Ctrl-C で即時終了）。");
  });

  const priceSchema = schema();
  const startedAt = Date.now();
  const counts = { entitled_rows: 0, entitled_empty: 0, not_entitled: 0 };
  let rowsWritten = 0;
  let failures = 0;

  console.log("");
  for (const [index, tradingDate] of targets.entries()) {
    if (stopRequested) {
      console.log(`中断。${index}/${targets.length} 日を完了。`);
      break;
    }

    // asOf は「いま」。過去日を asOf にすると、84日遅延の observedAt に
    // 引っかかって1行も取れない（それが PIT として正しい挙動）。
    const asOf = new Date().toISOString();
    const provider = new JQuantsFreePriceProvider({
      // 履歴の取り込みでは「実際に取得した時刻」より前に約定できたはずがない。
      resolveFirstExecutableAt: ({ retrievedAt }) => retrievedAt,
    });

    const dayStartedAt = Date.now();
    let batch;
    try {
      batch = await provider.fetchDailyUniverse({ tradingDate, asOf });
    } catch (error) {
      failures += 1;
      console.log(`  ${tradingDate}  失敗: ${error instanceof Error ? error.message : String(error)}`);
      // 失敗した日は台帳に載せない。次回の再開で拾い直す。
      continue;
    }

    if (batch.records.length > 0) {
      const partial = `${datePath(tradingDate)}.partial`;
      rmSync(partial, { force: true });
      appendPrivatePriceRecords({
        root: root(),
        path: partial,
        records: batch.records.map(withPriceRecordHash),
        schema: priceSchema,
      });
      renameSync(partial, datePath(tradingDate));
      rowsWritten += batch.records.length;
    }

    // 枠外は完了ではない。84日遅延が明ければ取れる日なので台帳に載せない。
    if (isCompletedOutcome(batch.outcome)) {
      appendLedger({
        tradingDate,
        outcome: batch.outcome,
        rowCount: batch.records.length,
        retrievedAt: batch.retrievedAt,
      });
    }
    counts[batch.outcome] += 1;

    const elapsedSec = (Date.now() - dayStartedAt) / 1000;
    const done = index + 1;
    const perDaySec = (Date.now() - startedAt) / 1000 / done;
    const remainSec = perDaySec * (targets.length - done);
    console.log(
      `  ${tradingDate}  ${String(batch.records.length).padStart(5)}件  ` +
      `${elapsedSec.toFixed(1)}s  [${done}/${targets.length}] 残り約${formatDuration(remainSec)}`,
    );
  }

  console.log("");
  console.log(`書き込み        ${rowsWritten} 行`);
  console.log(`立会あり        ${counts.entitled_rows} 日`);
  console.log(`0件（休場等）   ${counts.entitled_empty} 日`);
  console.log(`枠外            ${counts.not_entitled} 日（84日遅延の内側。完了にはしない）`);
  if (failures > 0) console.log(`失敗            ${failures} 日（次回の再開で拾い直す）`);
  console.log(`総時間          ${formatDuration((Date.now() - startedAt) / 1000)}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
