/**
 * TDnet 開示の取り込み（過去日ぶんの回収を含む）。
 *
 *   pnpm archive:tdnet -- --from 2026-08-13 --to 2026-09-10            # 計画のみ
 *   pnpm archive:tdnet -- --from 2026-08-13 --to 2026-09-10 --execute  # 実行
 *   pnpm archive:tdnet -- --catch-up --execute                         # 続きだけ
 *
 * ## 当日は保存しない
 *
 * 日本の適時開示は15時以降が大半。朝に当日を保存すると、その日の大半を
 * 取りこぼしたまま「観測済み」として確定してしまう。
 *
 * 実測（2026-09-11）: 04:55 に保存した当日ファイルは **0件**。
 * 同じ日を14時台に取り直すと **83件**。欠落検査もファイルがあるので
 * 引っかからず、永久に失われる。
 *
 * `--catch-up` は**昨日まで**しか取らない。当日は翌朝に完全な形で入る。
 *
 * ## なぜ急ぐか
 *
 * TDnet の公開閲覧サービスは約1ヶ月しか遡れない（実測: 2026-06-10 も
 * 2025-09-10 も `first page not found`）。**いま取れる約1ヶ月ぶんは、
 * 明日には1日ぶん失われる。** 不祥事・子会社イベントの Edge を検証するには
 * この一次情報が要るので、取れるうちに取る。
 *
 * ## 相手への配慮
 *
 * JPX の公開ページを1日1リクエスト（ページングがあればその回数）叩く。
 * 既定で3秒空ける。並列化しない。
 */

import { appendDisclosureSnapshot, assertIsoDate, listArchivedDates } from "./disclosure-archive.js";
import { resolveCatchUpRange } from "./catch-up-range.js";
import { todayJst } from "./date.js";
import { fetchTdnetDisclosureSnapshot } from "./fetcher/jpx.js";

const DEFAULT_INTERVAL_MS = 3_000;

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

function nextDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function isWeekend(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveTimer) => setTimeout(resolveTimer, ms));
}

/** 昨日（JST）。当日は開示が出揃っていないので保存の対象にしない。 */
function yesterdayJst(): string {
  const [year, month, day] = todayJst().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
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
      archivedDates: listArchivedDates(),
      // **昨日まで。** 当日を入れると出揃う前の姿で確定してしまう。
      today: yesterdayJst(),
    });
    if (!resolved.ok) {
      console.log(resolved.reason === "never_ingested"
        ? "一度も取り込んでいない。最初は --from を明示して走らせること。"
        : "既に最新（当日は翌朝に取る）。");
      return;
    }
    from = resolved.range.from;
    to = resolved.range.to;
    console.log(`追いつき      ${from} 〜 ${to}（${resolved.range.calendarDays}暦日・当日は含めない）`);
  } else {
    from = requiredDate("from");
    to = requiredDate("to");
  }
  if (from > to) throw new Error("--from must be on or before --to");
  const execute = hasFlag("execute");
  const includeWeekends = hasFlag("include-weekends");
  const intervalMs = Number(argValue("interval-ms") ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error("--interval-ms must be a non-negative number");
  }

  // 取り込み済みの判定はファイルの存在。0件の日も空ファイルが作られるので、
  // 「開示が無かった日」を毎回取り直すことにはならない。
  const archived = new Set(listArchivedDates());
  const targets: string[] = [];
  let skippedArchived = 0;
  let skippedWeekends = 0;
  for (let date = from; date <= to; date = nextDate(date)) {
    if (archived.has(date)) { skippedArchived += 1; continue; }
    if (!includeWeekends && isWeekend(date)) { skippedWeekends += 1; continue; }
    targets.push(date);
  }

  console.log(`期間          ${from} 〜 ${to}`);
  console.log(`取り込み済み  ${skippedArchived} 日`);
  console.log(`週末で除外    ${skippedWeekends} 日`);
  console.log(`残り          ${targets.length} 日`);
  console.log(`所要見込み    約${Math.ceil(targets.length * (intervalMs + 1500) / 60000)}分`);

  if (!execute) {
    console.log("\ndry-run。実行するには --execute を付ける。");
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
    console.log("\n中断要求を受けた。いまの1日を書き終えてから止まる。");
  });

  console.log("");
  let totalRows = 0;
  let failures = 0;
  for (const [index, observationDate] of targets.entries()) {
    if (stopRequested) { console.log(`中断。${index}/${targets.length} 日を完了。`); break; }
    if (index > 0) await sleep(intervalMs);

    try {
      const snapshot = await fetchTdnetDisclosureSnapshot({ observationDate });
      const result = appendDisclosureSnapshot({ snapshot, retrievedAt: new Date().toISOString() });
      totalRows += result.appended;
      console.log(
        `  ${observationDate}  開示 ${String(snapshot.disclosures.length).padStart(4)}件`
        + ` / 取り下げ ${snapshot.withdrawn.length}件`
        + ` → 新規 ${result.appended}件`
        + `  [${index + 1}/${targets.length}]`,
      );
    } catch (error) {
      failures += 1;
      // 遡れる範囲を超えた日は取得できない。失敗として数えるが止めない
      // （保持期間の端を探りながら回すため）。
      console.log(`  ${observationDate}  失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("");
  console.log(`保存          ${totalRows} 行`);
  if (failures > 0) {
    console.log(`失敗          ${failures} 日（公開ビューアの保持期間の外か、一時的な障害）`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
