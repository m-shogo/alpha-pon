/**
 * J-Quants の全銘柄日足を「1営業日=1リクエスト」で履歴取り込みする。
 *
 *   pnpm ingest:prices -- --from 2024-06-19 --to 2026-06-19            # 計画のみ
 *   pnpm ingest:prices -- --from 2024-06-19 --to 2026-06-19 --execute  # 実行
 *   pnpm ingest:prices -- --catch-up --execute                         # 続きだけ
 *
 * `--catch-up` は取り込み済みの最終日の翌日から今日まで。
 * **一度も取り込んでいなければ何もしない。** 起点が分からないまま
 * 適当な日から始めると穴の空いた保存庫ができる。最初は --from を明示する。
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
  jquantsFreeObservedAt,
} from "../providers/jquants-free.js";
import { compareExplicitIso8601Instants } from "../iso-instant.js";
import {
  JQUANTS_ADJUSTMENT_LEDGER_NAME,
  dedupeAdjustmentEvents,
  parseAdjustmentLedger,
  type JQuantsAdjustmentEvent,
} from "../providers/jquants-adjustment-events.js";
import {
  assertIsoDate,
  completedDatesFrom,
  estimateIngestSeconds,
  formatDuration,
  isCompletedIngest,
  planIngest,
  type IngestLedgerEntry,
  INGEST_LEDGER_NAME,
} from "../providers/jquants-daily-ingest.js";
import { MEASURED_DATE_QUERY_INTERVAL_MS } from "../../fetcher/adaptive-rate-limit.js";
import { jquantsV2DateCapCompact } from "../../fetcher/jquants.js";
import { resolveCatchUpRange } from "../../catch-up-range.js";
import { todayJst } from "../../date.js";
import type { JsonSchema } from "../schema.js";

const STORE_ROOT = "research/prices/jquants-free-daily";

// 2026-09-11 の実測（`?date=` を固定間隔で叩いた結果）に基づく。
//   20s : 10/10 成功 / 12s : 11回目で429 / 8s : 7回目で429
const MEASURED_OPTIMISTIC_INTERVAL_SEC = MEASURED_DATE_QUERY_INTERVAL_MS / 1000;
const MEASURED_THROTTLE_EVERY_N = 10;
const MEASURED_THROTTLE_COST_SEC = 90;

/**
 * 全銘柄クエリは1リクエストで約4,400銘柄・3.3MB を返す。銘柄指定より遥かに
 * 重く、既定の3秒間隔では枠を食い潰す（実測で間隔が11秒→120秒へ張り付いた）。
 * 明示指定が無ければ実測値を使う。
 */
function applyMeasuredRateLimit(): void {
  if (process.env.JQUANTS_V2_REQUEST_INTERVAL_MS === undefined) {
    process.env.JQUANTS_V2_REQUEST_INTERVAL_MS = String(MEASURED_DATE_QUERY_INTERVAL_MS);
  }
}

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
  return resolve(root(), INGEST_LEDGER_NAME);
}

function adjustmentLedgerPath(): string {
  return resolve(root(), JQUANTS_ADJUSTMENT_LEDGER_NAME);
}

/**
 * 権利落ちの観測を追記する。
 *
 * 価格ファイルの rename より前に書く。中断で同じ観測が二重に載ることは
 * あるが、読み出し側が (code, effectiveDate) で畳む。逆順にすると
 * 「価格はあるのに権利落ちの記録が無い日」ができ、そちらは復旧できない。
 */
function appendAdjustments(events: readonly JQuantsAdjustmentEvent[]): void {
  if (events.length === 0) return;
  mkdirSync(root(), { recursive: true, mode: 0o700 });
  appendFileSync(
    adjustmentLedgerPath(),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    { mode: 0o600 },
  );
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
  applyMeasuredRateLimit();
  const catchUp = hasFlag("catch-up");
  let from: string;
  let to: string;
  if (catchUp) {
    if (argValue("from") || argValue("to")) {
      throw new Error("--catch-up と --from/--to は同時に指定できない");
    }
    const resolved = resolveCatchUpRange({
      archivedDates: completedDates(),
      today: todayJst(),
    });
    if (!resolved.ok) {
      console.log(resolved.reason === "never_ingested"
        ? "一度も取り込んでいない。最初は --from を明示して走らせること。"
        : "既に最新。取り込む日がない。");
      return;
    }
    from = resolved.range.from;
    to = resolved.range.to;
    console.log(`追いつき      ${from} 〜 ${to}（${resolved.range.calendarDays}暦日）`);
  } else {
    from = requiredDate("from");
    to = requiredDate("to");
  }
  const execute = hasFlag("execute");
  const maxDaysRaw = argValue("max-days");
  const maxDays = maxDaysRaw === null ? null : Number(maxDaysRaw);
  if (maxDays !== null && (!Number.isSafeInteger(maxDays) || maxDays < 1)) {
    throw new Error(`--max-days must be a positive integer: ${maxDaysRaw}`);
  }

  const removedPartials = execute ? clearStalePartials() : 0;
  const plan = planIngest({ from, to, completed: completedDates() });

  // 契約範囲（84日遅延）の外は通信せずに弾かれる。見積りに数えると
  // 「20分かかる」と出て、実際は数秒で終わる。毎日走らせる判断を誤らせない。
  const capCompact = jquantsV2DateCapCompact();
  const cap = `${capCompact.slice(0, 4)}-${capCompact.slice(4, 6)}-${capCompact.slice(6, 8)}`;
  // さらに、開示遅延が明けていない日も外す。
  // `observedAt` は「対象日+84日の 23:59:59 JST」なので、契約上の上限日は
  // その日の深夜まで使えない。聞いても全行が抑止されて1リクエスト無駄になる。
  const nowIso = new Date().toISOString();
  const withinCap = plan.pending.filter((date) => date <= cap);
  const entitled = withinCap.filter((date) =>
    compareExplicitIso8601Instants(
      jquantsFreeObservedAt(date), nowIso, "observedAt", "now",
    ) <= 0);
  const beyondCap = plan.pending.length - withinCap.length;
  const notYetObservable = withinCap.length - entitled.length;

  const targets = maxDays === null ? entitled : entitled.slice(0, maxDays);
  const estimate = estimateIngestSeconds({
    pendingDays: targets.length,
    optimisticIntervalSec: MEASURED_OPTIMISTIC_INTERVAL_SEC,
    throttleEveryNRequests: MEASURED_THROTTLE_EVERY_N,
    throttleCostSec: MEASURED_THROTTLE_COST_SEC,
  });

  console.log(`期間            ${from} 〜 ${to}（暦日 ${plan.totalCalendarDays}）`);
  console.log(`取り込み済み    ${plan.skippedCompleted} 日`);
  console.log(`週末で除外      ${plan.skippedWeekends} 日`);
  console.log(
    `残り            ${entitled.length} 日${maxDays === null ? "" : `（今回は ${targets.length} 日）`}`
    + `${beyondCap > 0 ? ` / 契約範囲外 ${beyondCap} 日（84日遅延。${cap} まで取得可）` : ""}`
    + `${notYetObservable > 0 ? ` / 遅延明け待ち ${notYetObservable} 日（当日23:59 JST以降）` : ""}`,
  );
  console.log(`所要見込み      ${formatDuration(estimate.optimisticSec)} 〜 ${formatDuration(estimate.expectedSec)}`);
  console.log(`リクエスト間隔  ${process.env.JQUANTS_V2_REQUEST_INTERVAL_MS}ms（実測ベース）`);
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
  let withheldDays = 0;
  let adjustmentsWritten = 0;
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

    // 価格の確定より前に権利落ちを記録する（順序の理由は appendAdjustments）。
    appendAdjustments(batch.adjustments);
    adjustmentsWritten += batch.adjustments.length;

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

    // 枠外も、抑止された日も完了ではない。台帳に「完了」として載せない。
    // ただし抑止は起きた事実として残す（何度も同じ日で空振りしていないか
    // 後から分かるように）。
    const entry = {
      tradingDate,
      outcome: batch.outcome,
      rowCount: batch.records.length,
      retrievedAt: batch.retrievedAt,
      ...(batch.withheldForAsOf > 0 ? { withheldForAsOf: batch.withheldForAsOf } : {}),
    };
    if (isCompletedIngest(entry) || batch.withheldForAsOf > 0) appendLedger(entry);
    if (batch.withheldForAsOf > 0) withheldDays += 1;
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
  console.log(`権利落ち観測    ${adjustmentsWritten} 件`);
  console.log(`立会あり        ${counts.entitled_rows} 日`);
  console.log(`0件（休場等）   ${counts.entitled_empty} 日`);
  console.log(`枠外            ${counts.not_entitled} 日（84日遅延の内側。完了にはしない）`);
  if (withheldDays > 0) {
    console.log(
      `抑止            ${withheldDays} 日（行はあるが observedAt が未到達。完了にはしない）`,
    );
  }
  if (failures > 0) console.log(`失敗            ${failures} 日（次回の再開で拾い直す）`);
  console.log(`総時間          ${formatDuration((Date.now() - startedAt) / 1000)}`);

  // 台帳が読めない状態で終わると、次の工程が黙って「権利落ちなし」で走る。
  if (existsSync(adjustmentLedgerPath())) {
    const events = dedupeAdjustmentEvents(
      parseAdjustmentLedger(readFileSync(adjustmentLedgerPath(), "utf-8")),
    );
    console.log(`権利落ち台帳    ${events.length} 件（重複除去後）`);
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
