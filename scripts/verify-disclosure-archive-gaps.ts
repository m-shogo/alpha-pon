// 開示保存庫の欠落を検査する。
//
// TDnet の公開閲覧サービスは約1ヶ月しか遡れない。欠落は約30日以内なら
// `pnpm archive:tdnet` で埋められるが、それを過ぎると永久に埋められない。
// daily が数日落ちていたことに1ヶ月後に気づいても手遅れなので、
// 「あと何日で回収できなくなるか」を出す。
//
// 保存庫が空の環境（CI）では検査対象なしで正常終了する。

import { auditDisclosureArchive } from "../src/disclosure-archive-audit.js";
import { todayJst } from "../src/date.js";

// TDnet は JST 基準の情報源。UTC 日付で数えると、日本の早朝に
// 「最終保存から -1 日」のような値が出る（実際に出した）。
const today = todayJst();
const report = auditDisclosureArchive({ today });

if (report.archivedDates === 0) {
  console.log("disclosure-archive-gaps: 保存庫が空なので検査対象なし: ok");
  process.exit(0);
}

console.log(`保存済み ${report.archivedDates}日（${report.firstDate} 〜 ${report.lastDate}）`);
console.log(`最終保存から ${report.daysSinceLastArchive}日`);

if (report.lostGaps.length > 0) {
  console.log(`\n回収不能 ${report.lostGaps.length}日（保持期間を過ぎた）:`);
  for (const gap of report.lostGaps.slice(0, 10)) console.log(`  ${gap.date}`);
  if (report.lostGaps.length > 10) console.log(`  ほか ${report.lostGaps.length - 10}日`);
}

// 末尾の欠落は翌朝の追いつきが埋める。行動は要らないので落とさない。
const pending = report.gaps.filter((gap) => gap.fillableByCatchUp && gap.recoverable);
if (pending.length > 0) {
  console.log(
    `\n未取得 ${pending.length}日（${pending[0]!.date} 〜）。`
    + "翌朝の archive:tdnet --catch-up が埋める",
  );
}

// 途中の穴は追いつきが飛ばす。人が埋めるしかない。
if (report.needsManualBackfill.length > 0) {
  const soonest = report.needsManualBackfill
    .reduce((min, gap) => Math.min(min, gap.daysLeftToRecover), Number.POSITIVE_INFINITY);
  console.error(
    `\n欠落 ${report.needsManualBackfill.length}日。`
    + "**追いつきでは埋まらない**（途中の穴は最終日の翌日からしか取らないため飛ばされる）"
    + `。最短であと${soonest}日:`,
  );
  for (const gap of report.needsManualBackfill.slice(0, 10)) {
    console.error(`  ${gap.date}  残り${gap.daysLeftToRecover}日`);
  }
  console.error("");
  console.error(
    `  pnpm archive:tdnet -- --from ${report.needsManualBackfill[0]!.date} --to ${today} --execute`,
  );
  process.exit(1);
}

console.log("disclosure-archive-gaps: ok");
