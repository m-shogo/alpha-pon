// 開示保存庫の欠落を検査する。TDnet と EDINET の両方を見る。
//
// なぜ期限を出すか:
//   TDnet の公開閲覧サービスは約1ヶ月しか遡れない（実測: 2026-08-03 は
//   取れるが 2026-07-31 は not found）。欠落は約30日以内なら
//   `pnpm archive:tdnet` で埋められるが、それを過ぎると永久に埋められない。
//   daily が数日落ちていたことに1ヶ月後に気づいても手遅れになる。
//
//   EDINET は10年のローリング窓（実測 2026-09-11: 2016-09-12 は取得でき、
//   2016-09-09 は 404）。緊急度は桁違いだが、**収集が止まったことに
//   気づく仕組み**は同じだけ要る。止まっていること自体は毎日損をする。
//
//   決算（J-Quants /fins/summary）は **cap を上端とする2年の窓**。
//   cap は「今日 − 84日」なので窓は毎日ずれる。実測（2026-09-11）で
//   ある日 D が取得できるのは D + 814日まで。**取り逃した最古日は戻らない。**
//
// 保存庫が空の環境（CI）では検査対象なしで正常終了する。
// 実データがあるのはローカルだけなので、実質の実行場所は日次。

import {
  auditDisclosureArchive,
  EDINET_RETENTION_DAYS,
  JQUANTS_FINS_RETENTION_DAYS,
  TDNET_RETENTION_DAYS,
} from "../src/disclosure-archive-audit.js";
import { listArchivedDates } from "../src/disclosure-archive.js";
import { listArchivedEdinetDates } from "../src/edinet-document-archive.js";
import {
  FINS_INGEST_LEDGER_NAME,
  resolveFinsStoreRoot,
} from "../src/research/providers/jquants-fins-store.js";
import { completedDatesFrom } from "../src/research/providers/jquants-daily-ingest.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { todayJst } from "../src/date.js";

// どちらも JST 基準の情報源。UTC 日付で数えると、日本の早朝に
// 「最終保存から -1 日」のような値が出る（実際に出した）。
const today = todayJst();

/** 取り込み側と同じ判定。純粋関数は jquants-daily-ingest.ts と共有する。 */
function completedFinsDates(): Set<string> {
  const root = resolveFinsStoreRoot();
  if (!existsSync(root)) return new Set<string>();
  const ledgerPath = join(root, FINS_INGEST_LEDGER_NAME);
  return completedDatesFrom({
    fileNames: readdirSync(root),
    ledgerContent: existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf-8") : "",
  });
}

interface Source {
  label: string;
  archivedDates: readonly string[];
  retentionDays: number;
  /** 途中の穴を人が埋めるためのコマンド。 */
  backfillCommand: (from: string, to: string) => string;
  catchUpLabel: string;
}

const SOURCES: Source[] = [
  {
    label: "TDnet",
    archivedDates: listArchivedDates(),
    retentionDays: TDNET_RETENTION_DAYS,
    backfillCommand: (from, to) => `pnpm archive:tdnet -- --from ${from} --to ${to} --execute`,
    catchUpLabel: "archive:tdnet --catch-up",
  },
  {
    label: "決算(J-Quants)",
    // **ファイルだけ見ると休場日が穴に見える。** 0件の日はファイルを書かず
    // 台帳にだけ残る（実測で 2024-07-15 海の日、年末年始など29日）。
    // 取り込み側と同じ「完了」の定義（ファイル ∪ 台帳）を使う。
    archivedDates: [...completedFinsDates()],
    retentionDays: JQUANTS_FINS_RETENTION_DAYS,
    backfillCommand: (from, to) => `pnpm ingest:fins -- --from ${from} --to ${to} --execute`,
    catchUpLabel: "ingest:fins --catch-up",
  },
  {
    label: "EDINET",
    archivedDates: listArchivedEdinetDates(),
    retentionDays: EDINET_RETENTION_DAYS,
    backfillCommand: (from, to) => `pnpm archive:edinet -- --from ${from} --to ${to} --execute`,
    catchUpLabel: "archive:edinet --catch-up",
  },
];

let examined = 0;
let failed = 0;

for (const source of SOURCES) {
  const report = auditDisclosureArchive({
    today,
    archivedDates: source.archivedDates,
    retentionDays: source.retentionDays,
  });

  if (report.archivedDates === 0) {
    console.log(`[${source.label}] 保存庫が空なので検査対象なし`);
    continue;
  }
  examined += 1;

  console.log(
    `[${source.label}] 保存済み ${report.archivedDates}日`
    + `（${report.firstDate} 〜 ${report.lastDate}）/ 最終保存から ${report.daysSinceLastArchive}日`,
  );

  if (report.lostGaps.length > 0) {
    console.log(`  回収不能 ${report.lostGaps.length}日（保持期間を過ぎた）:`);
    for (const gap of report.lostGaps.slice(0, 10)) console.log(`    ${gap.date}`);
    if (report.lostGaps.length > 10) console.log(`    ほか ${report.lostGaps.length - 10}日`);
  }

  // 末尾の欠落は翌朝の追いつきが埋める。行動は要らないので落とさない。
  const pending = report.gaps.filter((gap) => gap.fillableByCatchUp && gap.recoverable);
  if (pending.length > 0) {
    console.log(
      `  未取得 ${pending.length}日（${pending[0]!.date} 〜）。`
      + `翌朝の ${source.catchUpLabel} が埋める`,
    );
  }

  // 途中の穴は追いつきが飛ばす。人が埋めるしかない。
  if (report.needsManualBackfill.length > 0) {
    failed += 1;
    const soonest = report.needsManualBackfill
      .reduce((min, gap) => Math.min(min, gap.daysLeftToRecover), Number.POSITIVE_INFINITY);
    console.error(
      `\n  [${source.label}] 欠落 ${report.needsManualBackfill.length}日。`
      + "**追いつきでは埋まらない**"
      + "（途中の穴は最終日の翌日からしか取らないため飛ばされる）"
      + `。最短であと${soonest}日:`,
    );
    for (const gap of report.needsManualBackfill.slice(0, 10)) {
      console.error(`    ${gap.date}  残り${gap.daysLeftToRecover}日`);
    }
    const first = report.needsManualBackfill[0]!.date;
    const last = report.needsManualBackfill.at(-1)!.date;
    console.error("");
    console.error(`    ${source.backfillCommand(first, last)}`);
    console.error("");
  }
}

if (examined === 0) {
  console.log("disclosure-archive-gaps: 保存庫が空なので検査対象なし: ok");
  process.exit(0);
}
if (failed > 0) process.exit(1);
console.log("disclosure-archive-gaps: ok");
