/**
 * EDINET 書類一覧の取り込み（過去日ぶん）。
 *
 *   pnpm archive:edinet -- --from 2024-06-19 --to 2026-06-18            # 計画のみ
 *   pnpm archive:edinet -- --from 2024-06-19 --to 2026-06-18 --execute  # 実行
 *   pnpm archive:edinet -- --catch-up --execute                         # 続きだけ
 *
 * `--catch-up` は取り込み済みの最終日の翌日から今日まで。
 * **一度も取り込んでいなければ何もしない。**
 *
 * ## なぜこれで45日の待ちが消えるか
 *
 * TDnet は約1ヶ月しか遡れないので、保存開始（2026-08-03）以降しかラベルが無い。
 * 一方 J-Quants Free の価格は84日遅延で上限が 2026-06-19。**重ならない。**
 *
 * EDINET の一覧 API は過去日を返す（実測 2024-06-19 / 2026-06-18 とも HTTP 200）。
 * **価格のある期間を丸ごとカバーできる。**
 *
 * ## 相手への配慮
 *
 * 1日1リクエスト。既定3秒間隔。並列化しない。
 */

import {
  appendEdinetDocuments,
  assertIsoDate,
  listArchivedEdinetDates,
} from "./edinet-document-archive.js";
import { fetchEdinetDocList, getEdinetConfigurationStatus } from "./fetcher/edinet.js";
import { lastCompleteDate, resolveCatchUpRange } from "./catch-up-range.js";
import { todayJst } from "./date.js";

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
  await new Promise((done) => setTimeout(done, ms));
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
      archivedDates: listArchivedEdinetDates(),
      // **昨日まで。** EDINET も日中に出続けるので、当日を保存すると
      // 出揃う前の姿が確定する。実測: 14時台 153件 → 15時台 223件。
      today: lastCompleteDate(todayJst()),
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
    // 明示指定でも当日は切る。出揃う前の姿を確定させないため。
    // どうしても要るときは --include-today（修復用）。
    const lastComplete = lastCompleteDate(todayJst());
    if (!hasFlag("include-today") && to > lastComplete) {
      console.log(`注意          ${to} → ${lastComplete} へ短縮（当日は出揃っていない）`);
      to = lastComplete;
    }
  }
  if (from > to) throw new Error("--from must be on or before --to");
  const execute = hasFlag("execute");
  const includeWeekends = hasFlag("include-weekends");
  const intervalMs = Number(argValue("interval-ms") ?? DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error("--interval-ms must be a non-negative number");
  }

  const archived = new Set(listArchivedEdinetDates());
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
  console.log(`所要見込み    約${Math.ceil(targets.length * (intervalMs + 800) / 60000)}分`);

  if (!execute) {
    console.log("\ndry-run。実行するには --execute を付ける。");
    return;
  }
  const configuration = getEdinetConfigurationStatus();
  if (!configuration.configured) {
    console.log("\nEDINET が未設定。.env の EDINET_API_KEY を確認すること");
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
    console.log("\n中断要求を受けた。いまの1日を書き終えてから止まる。");
  });

  console.log("");
  let totalRows = 0;
  let totalListed = 0;
  let failures = 0;
  for (const [index, submissionDate] of targets.entries()) {
    if (stopRequested) { console.log(`中断。${index}/${targets.length} 日を完了。`); break; }
    if (index > 0) await sleep(intervalMs);

    try {
      const docs = await fetchEdinetDocList(submissionDate);
      const result = appendEdinetDocuments({ submissionDate, docs });
      const listed = docs.filter((doc) => doc.secCode).length;
      const extraordinary = docs.filter((doc) => doc.secCode && doc.docTypeCode === "180").length;
      totalRows += result.appended;
      totalListed += listed;
      if (index % 20 === 0 || extraordinary > 0) {
        console.log(
          `  ${submissionDate}  全${String(docs.length).padStart(4)}件`
          + ` / 上場${String(listed).padStart(4)}件`
          + ` / 臨時報告書${String(extraordinary).padStart(3)}件`
          + `  [${index + 1}/${targets.length}]`,
        );
      }
    } catch (error) {
      failures += 1;
      console.log(`  ${submissionDate}  失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("");
  console.log(`保存          ${totalRows} 行（うち上場会社 ${totalListed} 件）`);
  if (failures > 0) console.log(`失敗          ${failures} 日（次回の再開で拾い直す）`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
