/**
 * J-Quants の決算開示を「1営業日=1リクエスト」で履歴取り込みする。
 *
 *   pnpm ingest:fins -- --from 2024-06-19 --to 2026-06-19            # 計画のみ
 *   pnpm ingest:fins -- --from 2024-06-19 --to 2026-06-19 --execute  # 実行
 *   pnpm ingest:fins -- --catch-up --execute                          # 続きだけ
 *
 * なぜ急ぐか:
 *   契約範囲は2年のローリング窓（実測 2024-06-19 〜 2026-06-19）。
 *   **今日取らなかった最古日は明日には取れない。**
 *
 * 価格取り込み（ingest-jquants-daily.ts）と同じ骨格。計画部の純粋関数は
 * そちらと共有する。違いは2つだけ。
 *
 *   1. 抑止（observedAt ゲート）をしない。行を**加工せず**そのまま保存し、
 *      PIT の判定は読み出し側で `DiscDate` から導く。
 *      取り込み時に落とすと、落とした日はもう契約範囲の外にいる。
 *   2. リクエスト間隔が短い。実測（2026-09-11）で
 *      3秒×16回・8秒×12回とも 429 なし。価格（?date= で約4,400銘柄）は
 *      8秒で7回目に429だったので、応答の重さで枠の消費が違うと分かる。
 *      余裕を見て 5秒にする。
 *
 * 性質（価格側と同じ）:
 *   - 既定は dry-run。ネットワークを触らない。
 *   - 再開可能。完了は `<date>.jsonl` の存在と台帳の和集合で判定する。
 *   - 中断安全。`.partial` に書いてから rename する。
 *   - 非営業日（0件）も台帳に記録する。記録しないと毎回問い合わせ直しになる。
 *   - 「枠外」は記録しない。遅延が明けても二度と取りに行かなくなるため。
 *   - Ctrl-C は「いまの1日を書き終えてから」止まる。
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  assertIsoDate,
  completedDatesFrom,
  estimateIngestSeconds,
  formatDuration,
  isCompletedIngest,
  planIngest,
  type IngestLedgerEntry,
} from "../providers/jquants-daily-ingest.js";
import {
  assertRowsBelongToDate,
  FINS_INGEST_LEDGER_NAME,
  JQUANTS_FINS_STORE_ROOT,
  toFinsDisclosureRecord,
} from "../providers/jquants-fins-store.js";
import { fetchFinancialSummaryByDate, jquantsV2DateCapCompact } from "../../fetcher/jquants.js";
import { resolveCatchUpRange } from "../../catch-up-range.js";
import { todayJst } from "../../date.js";

/**
 * リクエスト間隔の**初期値**。
 *
 * 間隔の制御そのものは `fetcher/adaptive-rate-limit.ts` が持っている
 * （429 を見たら90秒クールダウン＋間隔を×1.5、成功が続けば戻す）。
 * ここでその上にもう一段 sleep を重ねると**二重待ち**になる。
 * 実際に重ねてしまい、1日あたり 20秒のはずが約150秒かかった
 * （適応側が 120秒へ張り付いた上に、こちらの 20秒が乗っていた）。
 * 待つ場所は1つだけにする。
 *
 * **短い連射の測定から長時間の結論を出して失敗した。** 2026-09-11 の実測:
 *   3秒×16回・8秒×12回 → 429 なし
 *   → 5秒で本番投入 → **190リクエスト目から 330回連続で `fetch failed`**
 *      （HTTP エラーではなく接続レベル。しばらく後に叩くと正常に戻った）
 *
 * 16回の連射で分かるのはバーストの枠だけで、持続レートの枠は分からない。
 * 持続側の正確な閾値は測れていないので、**実績のある値に寄せる**:
 * 価格の `?date=` は 20秒間隔で 487営業日を連続取得できている。
 */
const DEFAULT_REQUEST_INTERVAL_MS = 20_000;

/**
 * 接続レベルの失敗からの立ち直り。
 *
 * 遮断は一時的だった（後から叩くと正常）。1回の失敗でその日を諦めると、
 * 330日ぶんを取りこぼしたまま「失敗330日」とだけ出る。
 * 待ってから繰り返す。待ち時間は回を追うごとに伸ばす。
 */
const RETRY_WAIT_MS = [30_000, 120_000, 300_000] as const;

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
  return resolve(process.cwd(), JQUANTS_FINS_STORE_ROOT);
}

function ledgerPath(): string {
  return resolve(root(), FINS_INGEST_LEDGER_NAME);
}

function datePath(date: string): string {
  return resolve(root(), `${date}.jsonl`);
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

function appendLedger(entry: IngestLedgerEntry): void {
  mkdirSync(root(), { recursive: true, mode: 0o700 });
  appendFileSync(ledgerPath(), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}


async function main(): Promise<void> {
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

  const intervalRaw = argValue("interval-ms");
  const intervalMs = intervalRaw === null ? DEFAULT_REQUEST_INTERVAL_MS : Number(intervalRaw);
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new Error(`--interval-ms must be a non-negative integer: ${intervalRaw}`);
  }

  // 間隔の制御は adaptive-rate-limit に一本化する。ここでは初期値を渡すだけ。
  if (process.env.JQUANTS_V2_REQUEST_INTERVAL_MS === undefined) {
    process.env.JQUANTS_V2_REQUEST_INTERVAL_MS = String(intervalMs);
  }

  const removedPartials = execute ? clearStalePartials() : 0;
  const plan = planIngest({ from, to, completed: completedDates() });

  // 契約範囲（84日遅延）の外は通信せずに弾く。見積りに数えると
  // 実際より遥かに長い数字が出る。
  const capCompact = jquantsV2DateCapCompact();
  const cap = `${capCompact.slice(0, 4)}-${capCompact.slice(4, 6)}-${capCompact.slice(6, 8)}`;
  const entitled = plan.pending.filter((date) => date <= cap);
  const beyondCap = plan.pending.length - entitled.length;

  const targets = maxDays === null ? entitled : entitled.slice(0, maxDays);
  const estimate = estimateIngestSeconds({
    pendingDays: targets.length,
    optimisticIntervalSec: intervalMs / 1000,
    // 価格側と違い、追加の絞りは実測されていない（3秒×16回でも429なし）。
    // 「毎回・追加コスト0秒」として見積もる。
    throttleEveryNRequests: 1,
    throttleCostSec: 0,
  });

  console.log(`期間            ${from} 〜 ${to}（暦日 ${plan.totalCalendarDays}）`);
  console.log(`取り込み済み    ${plan.skippedCompleted} 日`);
  console.log(`週末で除外      ${plan.skippedWeekends} 日`);
  console.log(
    `残り            ${entitled.length} 日${maxDays === null ? "" : `（今回は ${targets.length} 日）`}`
    + `${beyondCap > 0 ? ` / 契約範囲外 ${beyondCap} 日（84日遅延。${cap} まで取得可）` : ""}`,
  );
  console.log(`所要見込み      ${formatDuration(estimate.optimisticSec)}`);
  console.log(`リクエスト間隔  ${intervalMs}ms（初期値。429 を見たら適応側が広げる）`);
  if (removedPartials > 0) console.log(`書きかけを削除  ${removedPartials} 件`);

  if (!execute) {
    console.log("\ndry-run。実行するには --execute を付ける。");
    return;
  }
  if (!process.env.JQUANTS_API_KEY) {
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

  const startedAt = Date.now();
  const counts = { entitled_rows: 0, entitled_empty: 0, not_entitled: 0 };
  let rowsWritten = 0;
  let failures = 0;
  let retries = 0;

  console.log("");
  for (const [index, date] of targets.entries()) {
    if (stopRequested) {
      console.log(`中断。${index}/${targets.length} 日を完了。`);
      break;
    }
    const dayStartedAt = Date.now();
    const retrievedAt = new Date().toISOString();
    const ingestionRunId = `jquants-free-fins:${date}:${retrievedAt}`;

    let rows: Record<string, unknown>[] | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= RETRY_WAIT_MS.length; attempt += 1) {
      try {
        rows = await fetchFinancialSummaryByDate(date);
        if (rows !== null) assertRowsBelongToDate(date, rows);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        // 前提が崩れた（DiscDate の食い違い）なら待っても直らない。即座に諦める。
        if (error instanceof Error && error.message.includes("DiscDate")) break;
        const wait = RETRY_WAIT_MS[attempt];
        if (wait === undefined) break;
        retries += 1;
        console.log(
          `  ${date}  再試行 ${attempt + 1}/${RETRY_WAIT_MS.length}`
          + `（${Math.round(wait / 1000)}秒待つ）: `
          + `${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((resolveWait) => setTimeout(resolveWait, wait));
      }
    }
    if (lastError !== null) {
      failures += 1;
      console.log(
        `  ${date}  失敗: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
      // 失敗した日は台帳に載せない。次回の再開で拾い直す。
      continue;
    }

    if (rows === null) {
      // 枠外。完了にはしない。
      counts.not_entitled += 1;
      console.log(`  ${date}  枠外（84日遅延の内側）`);
      continue;
    }

    if (rows.length > 0) {
      const partial = `${datePath(date)}.partial`;
      rmSync(partial, { force: true });
      mkdirSync(root(), { recursive: true, mode: 0o700 });
      const lines = rows
        .map((raw) => JSON.stringify(
          toFinsDisclosureRecord({ queryDate: date, raw, retrievedAt, ingestionRunId }),
        ))
        .join("\n");
      writeFileSync(partial, `${lines}\n`, { mode: 0o600 });
      renameSync(partial, datePath(date));
      rowsWritten += rows.length;
    }

    const outcome = rows.length > 0 ? "entitled_rows" : "entitled_empty";
    const entry: IngestLedgerEntry = {
      tradingDate: date,
      outcome,
      rowCount: rows.length,
      retrievedAt,
    };
    if (isCompletedIngest(entry)) appendLedger(entry);
    counts[outcome] += 1;

    const elapsedSec = (Date.now() - dayStartedAt) / 1000;
    const done = index + 1;
    const perDaySec = (Date.now() - startedAt) / 1000 / done;
    const remainSec = perDaySec * (targets.length - done);
    console.log(
      `  ${date}  ${String(rows.length).padStart(4)}件  ${elapsedSec.toFixed(1)}s`
      + `  [${done}/${targets.length}] 残り約${formatDuration(remainSec)}`,
    );

  }

  console.log("");
  console.log(`書き込み        ${rowsWritten} 行`);
  console.log(`開示あり        ${counts.entitled_rows} 日`);
  console.log(`0件（休場等）   ${counts.entitled_empty} 日`);
  console.log(`枠外            ${counts.not_entitled} 日（84日遅延の内側。完了にはしない）`);
  if (retries > 0) console.log(`再試行          ${retries} 回`);
  if (failures > 0) console.log(`失敗            ${failures} 日（次回の再開で拾い直す）`);
  console.log(`総時間          ${formatDuration((Date.now() - startedAt) / 1000)}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
